import { ValidationError } from '@meith/core'

export const REPORT_TARGET_KINDS = ['post', 'thread', 'user', 'private_message'] as const
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number]

export type ReportStatus = 'open' | 'resolved' | 'rejected'

export const REASON_MIN = 3
export const REASON_MAX = 1000

export interface ReportTarget {
  readonly kind: ReportTargetKind
  readonly id: number
  readonly forumId: number | null
  readonly threadId: number | null
  readonly threadAuthorUserId: number | null
  readonly label: string
}

export interface NewReport {
  readonly target: ReportTarget
  readonly reporterUserId: number
  readonly reason: string
  readonly at: Date
}

export interface ReportRow {
  readonly id: number
  readonly kind: ReportTargetKind
  readonly targetId: number
  readonly forumId: number | null
  readonly threadId: number | null
  readonly targetLabel: string
  readonly reporterUserId: number | null
  readonly reporterUsername: string | null
  readonly reason: string
  readonly status: ReportStatus
  readonly assignedToUserId: number | null
  readonly assignedToUsername: string | null
  readonly createdAt: Date
}

export interface ReportEvent {
  readonly id: number
  readonly kind: 'opened' | 'assigned' | 'unassigned' | 'resolved' | 'rejected' | 'note'
  readonly actorUserId: number | null
  readonly actorUsername: string | null
  readonly note: string | null
  readonly createdAt: Date
}

export interface ReportPage {
  readonly rows: readonly ReportRow[]
  readonly nextCursor?: string
}

export interface ReportScope {
  readonly forumIds: readonly number[]
  readonly global: boolean
}

export interface ReportRepository {
  resolveTarget(
    kind: ReportTargetKind,
    id: number,
    reporterUserId: number,
  ): Promise<ReportTarget | null>

  open(report: NewReport): Promise<number | null>

  listOpen(
    scope: ReportScope,
    options: {
      readonly limit: number
      readonly after?: string
      readonly offset?: number
    },
  ): Promise<ReportPage>

  countOpen(scope: ReportScope): Promise<number>

  find(id: number): Promise<{ report: ReportRow; events: readonly ReportEvent[] } | null>

  assign(input: {
    readonly reportId: number
    readonly toUserId: number | null
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  close(input: {
    readonly reportId: number
    readonly status: 'resolved' | 'rejected'
    readonly note: string | null
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>
}

export const REPORTS_PAGE_SIZE = 25

export interface ReportNotifierPort {
  reportClosed(input: {
    readonly reporterUserId: number
    readonly reportId: number
    readonly outcome: 'resolved' | 'rejected'
    readonly targetLabel: string
  }): Promise<void>
}

export class ReportService {
  private readonly reports: ReportRepository
  private readonly notifier: ReportNotifierPort | null
  private readonly now: () => Date

  constructor(deps: {
    reports: ReportRepository
    notifier?: ReportNotifierPort | null
    now?: () => Date
  }) {
    this.reports = deps.reports
    this.notifier = deps.notifier ?? null
    this.now = deps.now ?? (() => new Date())
  }

  async file(input: {
    readonly kind: ReportTargetKind
    readonly targetId: number
    readonly reason: string
    readonly reporterUserId: number
  }): Promise<{ reportId: number; duplicate: boolean }> {
    const reason = input.reason.trim()
    if (reason.length < REASON_MIN) {
      throw new ValidationError('Say what is wrong with it, briefly.')
    }
    if (reason.length > REASON_MAX) {
      throw new ValidationError(`A reason may be at most ${REASON_MAX} characters.`)
    }

    const target = await this.reports.resolveTarget(
      input.kind,
      input.targetId,
      input.reporterUserId,
    )
    if (target === null) throw new ValidationError('That does not exist.')

    const reportId = await this.reports.open({
      target,
      reporterUserId: input.reporterUserId,
      reason,
      at: this.now(),
    })

    return reportId === null
      ? { reportId: 0, duplicate: true }
      : { reportId, duplicate: false }
  }

  async listOpen(
    scope: ReportScope,
    options: { readonly after?: string; readonly offset?: number } = {},
  ): Promise<ReportPage> {
    if (scope.forumIds.length === 0 && !scope.global) return { rows: [] }
    return this.reports.listOpen(scope, {
      limit: REPORTS_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
      ...(options.offset === undefined ? {} : { offset: options.offset }),
    })
  }

  async countOpen(scope: ReportScope): Promise<number> {
    if (scope.forumIds.length === 0 && !scope.global) return 0
    return this.reports.countOpen(scope)
  }

  async open(
    reportId: number,
    scope: ReportScope,
  ): Promise<{ report: ReportRow; events: readonly ReportEvent[] } | null> {
    const found = await this.reports.find(reportId)
    if (found === null) return null
    return inScope(found.report, scope) ? found : null
  }

  async assign(input: {
    readonly reportId: number
    readonly toUserId: number | null
    readonly actorUserId: number
    readonly scope: ReportScope
  }): Promise<void> {
    await this.requireInScope(input.reportId, input.scope)
    const changed = await this.reports.assign({
      reportId: input.reportId,
      toUserId: input.toUserId,
      actorUserId: input.actorUserId,
      at: this.now(),
    })
    if (!changed) throw new ValidationError('That report has already been closed.')
  }

  async close(input: {
    readonly reportId: number
    readonly status: 'resolved' | 'rejected'
    readonly note: string
    readonly actorUserId: number
    readonly scope: ReportScope
  }): Promise<void> {
    const note = input.note.trim()
    if (note.length > REASON_MAX) {
      throw new ValidationError(`A note may be at most ${REASON_MAX} characters.`)
    }

    const report = await this.requireInScope(input.reportId, input.scope)
    const changed = await this.reports.close({
      reportId: input.reportId,
      status: input.status,
      note: note.length === 0 ? null : note,
      actorUserId: input.actorUserId,
      at: this.now(),
    })
    if (!changed) throw new ValidationError('That report has already been closed.')

    await this.notifyReporter(report, input.status, input.actorUserId)
  }

  private async notifyReporter(
    report: ReportRow,
    outcome: 'resolved' | 'rejected',
    actorUserId: number,
  ): Promise<void> {
    if (this.notifier === null) return
    if (report.reporterUserId === null || report.reporterUserId === actorUserId) return

    await this.notifier
      .reportClosed({
        reporterUserId: report.reporterUserId,
        reportId: report.id,
        outcome,
        targetLabel: report.targetLabel,
      })
      .catch(() => undefined)
  }

  private async requireInScope(reportId: number, scope: ReportScope): Promise<ReportRow> {
    const found = await this.reports.find(reportId)
    if (found === null || !inScope(found.report, scope)) {
      throw new ValidationError('That report does not exist.')
    }
    return found.report
  }
}

export function inScope(report: ReportRow, scope: ReportScope): boolean {
  return report.forumId === null
    ? scope.global
    : scope.forumIds.includes(report.forumId)
}

export function parseTargetKind(value: string | undefined): ReportTargetKind | null {
  return REPORT_TARGET_KINDS.includes(value as ReportTargetKind)
    ? (value as ReportTargetKind)
    : null
}
