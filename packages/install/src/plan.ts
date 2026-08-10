export interface InstallStep {
  readonly id: string
  readonly title: string
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
  readonly error?: string
  readonly field?: string
}

export function fieldErrorsFromReport(
  report: readonly StepOutcome[],
): Record<string, string> {
  const failure = firstFailure(report)
  if (failure === null || failure.field === undefined) return {}
  return { [failure.field]: failure.error ?? 'That answer was refused.' }
}

export function stepTitle(id: string): string {
  return INSTALL_STEPS.find((step) => step.id === id)?.title ?? id
}

export function freshReport(): readonly StepOutcome[] {
  return INSTALL_STEPS.map((step) => ({ id: step.id, status: 'pending' as const }))
}

export function installed(report: readonly StepOutcome[]): boolean {
  return report.length === INSTALL_STEPS.length && report.every((step) => step.status === 'done')
}

export function firstFailure(report: readonly StepOutcome[]): StepOutcome | null {
  return report.find((step) => step.status === 'failed') ?? null
}
