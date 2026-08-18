export interface InstallStep {
  readonly id: string
  readonly titleKey: string
  readonly detailKey: string
}

export const INSTALL_STEPS: readonly InstallStep[] = [
  {
    id: 'migrate',
    titleKey: 'install.step.migrate.title',
    detailKey: 'install.step.migrate.detail',
  },
  {
    id: 'settings',
    titleKey: 'install.step.settings.title',
    detailKey: 'install.step.settings.detail',
  },
  {
    id: 'admin',
    titleKey: 'install.step.admin.title',
    detailKey: 'install.step.admin.detail',
  },
  {
    id: 'forum',
    titleKey: 'install.step.forum.title',
    detailKey: 'install.step.forum.detail',
  },
  {
    id: 'seal',
    titleKey: 'install.step.seal.title',
    detailKey: 'install.step.seal.detail',
  },
]

export type StepStatus = 'pending' | 'done' | 'failed'

export interface StepOutcome {
  readonly id: string
  readonly status: StepStatus
  readonly error?: string
  readonly field?: string
}

export function fieldErrorsFromReport(report: readonly StepOutcome[]): Record<string, string> {
  const failure = firstFailure(report)
  if (failure === null || failure.field === undefined) return {}
  return { [failure.field]: failure.error ?? 'installAction.answerRefused' }
}

export function stepTitleKey(id: string): string {
  return INSTALL_STEPS.find((step) => step.id === id)?.titleKey ?? id
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
