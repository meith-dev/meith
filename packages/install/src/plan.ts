/**
 * F83 — what installing actually does, as an ordered list.
 *
 * The steps are data for the same reason the route registry is: the page lists
 * them before you press the button and reports them afterwards, and a list that
 * lived only inside the function would drift from what the screen promised.
 *
 * ## Order is the correctness argument
 *
 * Migrations first, obviously. Then settings, because the account creation reads
 * the board's own registration rules. Then the administrator. Then a forum,
 * because a board with no forum renders an index that looks broken. Then — last,
 * and only if everything above succeeded — the marker that disables the
 * installer.
 *
 * **The marker is last on purpose.** Written first, a failure halfway through
 * would leave a board that is "installed", has no administrator, and cannot be
 * installed again: unrecoverable without SQL. Written last, a failure leaves a
 * board that can be fixed by trying again — except for the one case that must
 * not be repeatable, which the *user count* gate covers independently
 * (see `preflight`).
 *
 * ## Mail is proved before any of this runs, and is not a step
 *
 * When the operator configured mail, the action sends a real message to the
 * address they gave for the administrator **before** the first migration —
 * outside this list entirely. A step would be too late by definition: it would
 * run after the account exists, so a wrong API key would leave a board that is
 * installed, sealed, and unable to mail anybody, fixable only from a panel the
 * operator has not seen yet. Failing before the first write leaves nothing
 * behind and puts the provider's own error message on the form beside the field
 * that caused it.
 */

export interface InstallStep {
  readonly id: string
  readonly title: string
  /** What a reader should understand is happening. Shown before and after. */
  readonly detail: string
}

export const INSTALL_STEPS: readonly InstallStep[] = [
  {
    id: 'migrate',
    title: 'Apply migrations',
    detail: 'Creates every table, index and seeded usergroup. Forward-only.',
  },
  {
    id: 'settings',
    title: 'Record the board’s name and mail settings',
    detail:
      'The only settings the installer writes. Everything else has a default and ' +
      'a screen.',
  },
  {
    id: 'admin',
    title: 'Create the administrator',
    detail: 'Argon2id, the same registration path a member uses, then promoted.',
  },
  {
    id: 'forum',
    title: 'Create a first forum',
    detail: 'A category and one forum inside it, so the index is not empty.',
  },
  {
    id: 'seal',
    title: 'Disable the installer',
    detail: 'Irreversible. /install answers 404 from here on.',
  },
]

export type StepStatus = 'pending' | 'done' | 'failed'

export interface StepOutcome {
  readonly id: string
  readonly status: StepStatus
  /** Present on a failure, and safe to show: never a connection string. */
  readonly error?: string
  /**
   * The form field the board refused, when the step failed because of an
   * *answer* rather than because something broke.
   *
   * The distinction is the whole point. "Create the administrator" runs the
   * board's own registration command, which refuses a reserved name, a taken
   * address or a short password — all of them things the operator typed into a
   * box a screen above the button. Without this the refusal arrived as *"the
   * 'admin' step failed: That username is reserved"*, which reads as a fault in
   * the installer, names no box, and — since the step id is `admin` — appears to
   * be quoting the very name that was rejected.
   *
   * Absent for a genuine fault, because there is no box that would fix one.
   */
  readonly field?: string
}

/**
 * The failed step's message re-aimed at the box that caused it.
 *
 * Empty when the failure was not about an answer, so a caller can spread it
 * unconditionally: a broken step contributes no field errors and keeps the
 * step-failure headline to itself.
 */
export function fieldErrorsFromReport(
  report: readonly StepOutcome[],
): Record<string, string> {
  const failure = firstFailure(report)
  if (failure === null || failure.field === undefined) return {}
  return { [failure.field]: failure.error ?? 'That answer was refused.' }
}

/** A step's title, for a screen that would otherwise print the raw id. */
export function stepTitle(id: string): string {
  return INSTALL_STEPS.find((step) => step.id === id)?.title ?? id
}

/**
 * The steps as a fresh report.
 *
 * Exported so the screen can render the list before anything has run, using the
 * same shape it renders afterwards — one component, one set of states, rather
 * than a "before" view and an "after" view that disagree about what a step is.
 */
export function freshReport(): readonly StepOutcome[] {
  return INSTALL_STEPS.map((step) => ({ id: step.id, status: 'pending' as const }))
}

/** Did every step succeed? */
export function installed(report: readonly StepOutcome[]): boolean {
  return report.length === INSTALL_STEPS.length && report.every((step) => step.status === 'done')
}

/**
 * The first failure, or `null`.
 *
 * The *first*, not all of them: the steps are sequential and a later one that
 * did not run is not a second problem. Reporting three failures when one caused
 * the others is how an error screen stops being read.
 */
export function firstFailure(report: readonly StepOutcome[]): StepOutcome | null {
  return report.find((step) => step.status === 'failed') ?? null
}
