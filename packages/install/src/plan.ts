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
    title: 'Record the board’s name',
    detail: 'The only setting the installer writes. Everything else has a default.',
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
