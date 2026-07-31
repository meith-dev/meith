/**
 * F49 — reports over Postgres.
 *
 * Every write that changes a report also writes its history row, in the same
 * transaction. That is the whole reason `report_events` exists: a status that
 * changed with no record of who changed it is the state a moderation log is
 * supposed to prevent, and two separate writes eventually produce it.
 */
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT } from '@forum/core'
import type {
  NewReport,
  ReportEvent,
  ReportPage,
  ReportRepository,
  ReportRow,
  ReportScope,
  ReportTarget,
  ReportTargetKind,
} from '@forum/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'
import { threads } from './schema'

/** See `moderation-queue.ts`: drizzle expands an array into a placeholder list. */
function idList(ids: readonly number[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`(null)`
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`
}

function encodeCursor(row: ReportRow): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString(
    'base64url',
  )
}

function decodeCursor(value: string): { at: Date; id: number } | null {
  try {
    const [at, id] = Buffer.from(value, 'base64url').toString('utf8').split('|')
    if (at === undefined || id === undefined) return null
    const when = new Date(at)
    const numeric = Number(id)
    if (Number.isNaN(when.getTime()) || !Number.isSafeInteger(numeric)) return null
    return { at: when, id: numeric }
  } catch {
    return null
  }
}

interface RawReport {
  id: number
  target_kind: ReportTargetKind
  target_id: number
  forum_id: number | null
  thread_id: number | null
  target_label: string
  reporter_user_id: number | null
  reporter_username: string | null
  reason: string
  status: ReportRow['status']
  assigned_to_user_id: number | null
  assigned_username: string | null
  created_at: Date
}

function toReport(row: RawReport): ReportRow {
  return {
    id: Number(row.id),
    kind: row.target_kind,
    targetId: Number(row.target_id),
    forumId: row.forum_id === null ? null : Number(row.forum_id),
    threadId: row.thread_id === null ? null : Number(row.thread_id),
    targetLabel: row.target_label,
    reporterUserId: row.reporter_user_id === null ? null : Number(row.reporter_user_id),
    reporterUsername: row.reporter_username,
    reason: row.reason,
    status: row.status,
    assignedToUserId:
      row.assigned_to_user_id === null ? null : Number(row.assigned_to_user_id),
    assignedToUsername: row.assigned_username,
    createdAt: new Date(row.created_at),
  }
}

const SELECT_REPORT = sql`
  select r.id, r.target_kind, r.target_id, r.forum_id, r.thread_id, r.target_label,
         r.reporter_user_id, reporter.username as reporter_username,
         r.reason, r.status, r.assigned_to_user_id,
         assignee.username as assigned_username, r.created_at
    from reports r
    left join users reporter on reporter.id = r.reporter_user_id
    left join users assignee on assignee.id = r.assigned_to_user_id
`

export class PostgresReportRepository implements ReportRepository {
  constructor(private readonly db: Database) {}

  /**
   * What a report points at, read now rather than taken from the form.
   *
   * Only *public* content can be reported. A member cannot report something
   * they could not have seen, and a moderator has better tools than the report
   * button for content that is already held or removed — so this uses
   * `PUBLIC_CONTENT` for every actor rather than the reader's scope (F47).
   */
  async resolveTarget(
    kind: ReportTargetKind,
    id: number,
  ): Promise<ReportTarget | null> {
    if (kind === 'user') {
      const rows = resultRows(
        await this.db.execute(sql`
          select id, username from users where id = ${id} and deleted_at is null
        `),
      ) as Array<{ id: number; username: string }>
      const row = rows[0]
      return row === undefined
        ? null
        : { kind, id: Number(row.id), forumId: null, threadId: null, label: row.username }
    }

    if (kind === 'thread') {
      const rows = resultRows(
        await this.db.execute(sql`
          select id, forum_id, title from threads
           where id = ${id} and ${visibleIn(threads.visibility, PUBLIC_CONTENT)}
        `),
      ) as Array<{ id: number; forum_id: number; title: string }>
      const row = rows[0]
      return row === undefined
        ? null
        : {
            kind,
            id: Number(row.id),
            forumId: Number(row.forum_id),
            threadId: Number(row.id),
            label: row.title,
          }
    }

    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.forum_id, p.thread_id, t.title
          from posts p
          join threads t on t.id = p.thread_id
         where p.id = ${id}
           and ${visibleIn(sql`p.visibility`, PUBLIC_CONTENT)}
           and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
      `),
    ) as Array<{ id: number; forum_id: number; thread_id: number; title: string }>
    const row = rows[0]
    return row === undefined
      ? null
      : {
          kind,
          id: Number(row.id),
          forumId: Number(row.forum_id),
          threadId: Number(row.thread_id),
          label: row.title,
        }
  }

  /**
   * File a report and its `opened` event together.
   *
   * The duplicate check is the unique index, not a prior `select`: two clicks
   * arriving at once would both pass a check and both insert. `on conflict do
   * nothing` makes the database the arbiter, and an empty `returning` is the
   * friendly answer rather than an error.
   */
  async open(report: NewReport): Promise<number | null> {
    return this.db.transaction(async (tx) => {
      const inserted = resultRows(
        await tx.execute(sql`
          insert into reports
            (target_kind, target_id, forum_id, thread_id, target_label,
             reporter_user_id, reason, status, created_at, updated_at)
          values
            (${report.target.kind}, ${report.target.id}, ${report.target.forumId},
             ${report.target.threadId}, ${report.target.label},
             ${report.reporterUserId}, ${report.reason}, 'open',
             ${report.at}, ${report.at})
          on conflict do nothing
          returning id
        `),
      ) as Array<{ id: number }>

      const row = inserted[0]
      if (!row) return null

      await tx.execute(sql`
        insert into report_events (report_id, actor_user_id, kind, created_at)
        values (${row.id}, ${report.reporterUserId}, 'opened', ${report.at})
      `)
      return Number(row.id)
    })
  }

  /**
   * Outstanding reports in scope, oldest first.
   *
   * The two halves of the scope are one predicate rather than two queries: a
   * moderator who also holds board staff sees their forums *and* the user
   * reports in one page, ordered together.
   */
  private scopePredicate(scope: ReportScope): ReturnType<typeof sql> {
    const byForum = sql`r.forum_id in ${idList(scope.forumIds)}`
    return scope.global ? sql`(${byForum} or r.forum_id is null)` : byForum
  }

  async listOpen(
    scope: ReportScope,
    options: { readonly limit: number; readonly after?: string },
  ): Promise<ReportPage> {
    const cursor = options.after === undefined ? null : decodeCursor(options.after)
    const after = cursor
      ? sql`and (r.created_at, r.id) > (${cursor.at}, ${cursor.id})`
      : sql``

    const rows = resultRows(
      await this.db.execute(sql`
        ${SELECT_REPORT}
         where r.status = 'open' and ${this.scopePredicate(scope)} ${after}
         order by r.created_at, r.id
         limit ${options.limit + 1}
      `),
    ) as RawReport[]

    const page = rows.slice(0, options.limit).map(toReport)
    const last = page.at(-1)
    return rows.length > options.limit && last
      ? { rows: page, nextCursor: encodeCursor(last) }
      : { rows: page }
  }

  async countOpen(scope: ReportScope): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as open from reports r
         where r.status = 'open' and ${this.scopePredicate(scope)}
      `),
    ) as Array<{ open: number }>
    return Number(rows[0]?.open ?? 0)
  }

  async find(
    id: number,
  ): Promise<{ report: ReportRow; events: readonly ReportEvent[] } | null> {
    const rows = resultRows(
      await this.db.execute(sql`${SELECT_REPORT} where r.id = ${id}`),
    ) as RawReport[]
    const row = rows[0]
    if (!row) return null

    const events = resultRows(
      await this.db.execute(sql`
        select e.id, e.kind, e.actor_user_id, u.username as actor_username,
               e.note, e.created_at
          from report_events e
          left join users u on u.id = e.actor_user_id
         where e.report_id = ${id}
         order by e.created_at, e.id
      `),
    ) as Array<{
      id: number
      kind: ReportEvent['kind']
      actor_user_id: number | null
      actor_username: string | null
      note: string | null
      created_at: Date
    }>

    return {
      report: toReport(row),
      events: events.map((event) => ({
        id: Number(event.id),
        kind: event.kind,
        actorUserId: event.actor_user_id === null ? null : Number(event.actor_user_id),
        actorUsername: event.actor_username,
        note: event.note,
        createdAt: new Date(event.created_at),
      })),
    }
  }

  async assign(input: {
    readonly reportId: number
    readonly toUserId: number | null
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      /*
       * `status = 'open'` in the WHERE, not a prior read: assigning a report
       * somebody closed a moment ago would look like it worked and change
       * nothing, which is the failure a second moderator notices an hour later.
       */
      const moved = resultRows(
        await tx.execute(sql`
          update reports
             set assigned_to_user_id = ${input.toUserId}, updated_at = ${input.at}
           where id = ${input.reportId} and status = 'open'
           returning id
        `),
      ) as Array<{ id: number }>
      if (moved.length === 0) return false

      await tx.execute(sql`
        insert into report_events (report_id, actor_user_id, kind, created_at)
        values (
          ${input.reportId}, ${input.actorUserId},
          ${input.toUserId === null ? 'unassigned' : 'assigned'}, ${input.at}
        )
      `)
      return true
    })
  }

  async close(input: {
    readonly reportId: number
    readonly status: 'resolved' | 'rejected'
    readonly note: string | null
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const moved = resultRows(
        await tx.execute(sql`
          update reports
             set status = ${input.status},
                 resolved_by_user_id = ${input.actorUserId},
                 resolved_at = ${input.at},
                 updated_at = ${input.at}
           where id = ${input.reportId} and status = 'open'
           returning id
        `),
      ) as Array<{ id: number }>
      if (moved.length === 0) return false

      /*
       * The note goes on the event, never on the report. "Resolved because X"
       * belongs to *that* resolution — on the report it would be overwritten by
       * the next one, and the history would say a decision was made for a reason
       * nobody gave.
       */
      await tx.execute(sql`
        insert into report_events (report_id, actor_user_id, kind, note, created_at)
        values (${input.reportId}, ${input.actorUserId}, ${input.status},
                ${input.note}, ${input.at})
      `)
      return true
    })
  }
}
