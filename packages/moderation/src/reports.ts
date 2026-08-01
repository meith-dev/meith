/**
 * F49 — reports.
 *
 * A report is a member saying "a moderator should look at this". The mechanism
 * is small; what makes it worth its own file is that it has two audiences with
 * opposite needs, and almost every decision here is about keeping them apart:
 *
 *   - **The reporter** needs to know their report was filed, and nothing else.
 *     Not who is handling it, not what was decided, and above all not the note.
 *   - **The moderator** needs the history — who assigned it, when, and why the
 *     last person closed one like it.
 *
 * So the note lives on the *event*, never on the report, and nothing that
 * returns a report to a reporter carries an event at all.
 */
import { ValidationError } from '@forum/core'

export const REPORT_TARGET_KINDS = ['post', 'thread', 'user', 'private_message'] as const
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number]

export type ReportStatus = 'open' | 'resolved' | 'rejected'

export const REASON_MIN = 3
export const REASON_MAX = 1000

/** Where a report points, resolved from the database rather than the form. */
export interface ReportTarget {
  readonly kind: ReportTargetKind
  readonly id: number
  /** Null for a user or private-message report: neither lives in a forum. */
  readonly forumId: number | null
  readonly threadId: number | null
  /** Captured now, because the target may be edited or removed afterwards. */
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
  /** Private to moderators. Never crosses into anything a reporter sees. */
  readonly note: string | null
  readonly createdAt: Date
}

export interface ReportPage {
  readonly rows: readonly ReportRow[]
  readonly nextCursor?: string
}

/**
 * Which reports an actor may see.
 *
 * Two sets, because reports have two scopes. `forumIds` are the forums this
 * actor moderates; `global` says whether they may also see reports with no
 * forum at all — a report about a *member* belongs to nobody's forum, so it is
 * board staff's or it is nobody's.
 */
export interface ReportScope {
  readonly forumIds: readonly number[]
  readonly global: boolean
}

export interface ReportRepository {
  /**
   * Resolve what a report points at. Null when it does not exist.
   *
   * `reporterUserId` is passed because for one kind the two questions are the
   * same one: a private message "exists" only for somebody who holds a copy of
   * it (F60). The other kinds ignore it — a post is a post whoever is looking.
   */
  resolveTarget(
    kind: ReportTargetKind,
    id: number,
    reporterUserId: number,
  ): Promise<ReportTarget | null>

  /**
   * File it. Returns null when this reporter already has an open report against
   * this target — which the unique index enforces, so this is the friendly path
   * to the same answer rather than a check that could race it.
   */
  open(report: NewReport): Promise<number | null>

  listOpen(
    scope: ReportScope,
    options: { readonly limit: number; readonly after?: string },
  ): Promise<ReportPage>

  countOpen(scope: ReportScope): Promise<number>

  /** One report with its history, or null. Scope is checked by the caller. */
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

/**
 * How the reporter is told their report was closed (F55).
 *
 * The narrowest possible port, and the narrowness is the point: D48's whole
 * argument is that a report has two audiences and almost every decision keeps
 * them apart. A moderator's private note lives in `report_events` and is not a
 * field this port can carry, so there is no version of this call that leaks it.
 *
 * Optional, like F53's: a board with no notification store still moderates
 * reports, and closing one must not fail because telling somebody did.
 */
export interface ReportNotifierPort {
  reportClosed(input: {
    readonly reporterUserId: number
    readonly reportId: number
    readonly outcome: 'resolved' | 'rejected'
    /** The label captured when the report was filed, never a live read. */
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

  /**
   * File a report.
   *
   * The target is resolved from the database, not taken from the form: a form
   * says *which* row, and everything else about it — which forum it is in, what
   * it is called — has to be read. The caller has already checked that this
   * actor may see the target; what this adds is that the report is about
   * something real.
   */
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

    /*
     * Reporting yourself is not forbidden — it is a thing people do by accident
     * and a thing moderators can simply close. What *is* forbidden is filing the
     * same report twice, because a report button that adds a queue row on every
     * click is the cheapest denial-of-service on the board.
     */
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
    options: { readonly after?: string } = {},
  ): Promise<ReportPage> {
    if (scope.forumIds.length === 0 && !scope.global) return { rows: [] }
    return this.reports.listOpen(scope, {
      limit: REPORTS_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
    })
  }

  async countOpen(scope: ReportScope): Promise<number> {
    if (scope.forumIds.length === 0 && !scope.global) return 0
    return this.reports.countOpen(scope)
  }

  /**
   * Read one report, if this actor's scope covers it.
   *
   * The scope check is here rather than in the query because a report's scope
   * is a property of the report (its forum, or the absence of one) and the set
   * belongs to the actor — putting both in SQL would mean the answer to "may I
   * see this" lived in two places.
   */
  async open(
    reportId: number,
    scope: ReportScope,
  ): Promise<{ report: ReportRow; events: readonly ReportEvent[] } | null> {
    const found = await this.reports.find(reportId)
    if (found === null) return null
    return inScope(found.report, scope) ? found : null
  }

  /** Take a report, hand it to somebody else, or put it back. */
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

  /**
   * Close a report, with a note nobody outside moderation ever sees.
   *
   * The note is optional on purpose: requiring one on every dismissal produces
   * a column full of "spam" and "n/a", which is worse than an empty one because
   * it looks like a record.
   */
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

  /**
   * Tell the reporter, once, that their report was dealt with.
   *
   * Two people are deliberately not told. A reporter whose account has gone
   * takes their notification with them, and **a moderator closing their own
   * report is not notified of their own decision** — a notification is for
   * something you would not otherwise know.
   *
   * Failure is swallowed for F53's reason: the report is closed and committed,
   * so throwing here would report a successful moderator action as a failed
   * one.
   */
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
    /*
     * The same answer for "does not exist" and "not yours". A moderator of one
     * forum probing ids should not be able to learn that a report exists in
     * another — which is the same rule every other read on the board follows.
     */
    if (found === null || !inScope(found.report, scope)) {
      throw new ValidationError('That report does not exist.')
    }
    return found.report
  }
}

/** A forum report belongs to its forum's moderators; a user report to staff. */
export function inScope(report: ReportRow, scope: ReportScope): boolean {
  return report.forumId === null
    ? scope.global
    : scope.forumIds.includes(report.forumId)
}

/** Parse `?kind=` without trusting it. */
export function parseTargetKind(value: string | undefined): ReportTargetKind | null {
  return REPORT_TARGET_KINDS.includes(value as ReportTargetKind)
    ? (value as ReportTargetKind)
    : null
}
