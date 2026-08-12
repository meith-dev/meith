import { sql } from 'drizzle-orm'

import type {
  IpMatch,
  ModCpRepository,
  ModLogEntry,
  ModLogPage,
} from '@meith/moderation'
import { MOD_LOG_ACTIONS } from '@meith/moderation'

import type { Database } from './client'
import { decodeCursor, encodeCursor } from './cursor'
import { resultRows } from './result-rows'
import { idList, textList } from './sql-lists'
import { PENDING_APPROVAL } from './visibility'

interface LogRow {
  id: number
  action: string
  user_id: number | null
  username: string | null
  forum_id: number | null
  forum_title: string | null
  detail: Record<string, unknown> | null
  created_at: Date
}

const DETAIL_LABELS: Readonly<Record<string, string>> = {
  threadId: 'Thread',
  threadIds: 'Threads',
  postId: 'Post',
  postIds: 'Posts',
  forumId: 'Forum',
  from: 'From forum',
  to: 'To forum',
  toForumId: 'To forum',
  applied: 'Applied to',
  posts: 'Posts affected',
  userId: 'Member',
  warningId: 'Warning',
  points: 'Points',
  total: 'New total',
  matches: 'Accounts found',
  subjectUserId: 'Member',
  reportId: 'Report',
  value: 'Set to',
}

function flattenDetail(
  detail: Record<string, unknown> | null,
): readonly { label: string; value: string }[] {
  if (detail === null) return []
  const out: { label: string; value: string }[] = []
  for (const [key, label] of Object.entries(DETAIL_LABELS)) {
    const value = detail[key]
    if (value === undefined || value === null) continue
    const rendered = Array.isArray(value)
      ? value.slice(0, 20).map(String).join(', ')
      : String(value)
    if (rendered === '') continue
    out.push({ label, value: rendered })
  }
  return out
}

export class PostgresModCpRepository implements ModCpRepository {
  constructor(private readonly db: Database) {}

  async log(input: {
    readonly forumIds: readonly number[]
    readonly actorUserId: number
    readonly limit: number
    readonly after?: string | undefined
  }): Promise<ModLogPage> {
    const cursor = input.after === undefined ? null : decodeCursor(input.after)
    const after = cursor
      ? sql`and (e.created_at, e.id) < (${cursor.at}, ${cursor.id})`
      : sql``

    const rows = resultRows(
      await this.db.execute(sql`
        with entry as (
          select l.id, l.action, l.user_id, l.created_at, l.detail,
                 coalesce(
                   (l.detail->>'forumId')::int,
                   (l.detail->>'toForumId')::int,
                   (l.detail->>'to')::int,
                   (l.detail->>'from')::int
                 ) as forum_id
            from admin_log l
           where l.action in ${textList(MOD_LOG_ACTIONS)}
        )
        select e.id, e.action, e.user_id, u.username, e.forum_id,
               f.title as forum_title, e.detail, e.created_at
          from entry e
          left join users u on u.id = e.user_id
          left join forums f on f.id = e.forum_id
         where (
                 e.forum_id in ${idList(input.forumIds)}
                 /*
                  * Entries with no forum at all — a warning, an address lookup —
                  * are the actor's own business only. A moderator seeing every
                  * warning on the board through the log would be a wider grant
                  * than the warn screen itself gives.
                  */
                 or (e.forum_id is null and e.user_id = ${input.actorUserId})
                 /* Their own acts stay visible even in a forum they have left. */
                 or e.user_id = ${input.actorUserId}
               )
           ${after}
         order by e.created_at desc, e.id desc
         limit ${input.limit + 1}
      `),
    ) as LogRow[]

    const entries = rows.slice(0, input.limit).map(
      (row): ModLogEntry => ({
        id: Number(row.id),
        action: row.action,
        actorUserId: row.user_id === null ? null : Number(row.user_id),
        actorUsername: row.username,
        forumId: row.forum_id === null ? null : Number(row.forum_id),
        forumTitle: row.forum_title,
        detail: flattenDetail(row.detail),
        at: new Date(row.created_at),
      }),
    )
    const last = entries.at(-1)
    return rows.length > input.limit && last
      ? { entries, nextCursor: encodeCursor(last.at, last.id) }
      : { entries }
  }

  async workload(
    forumIds: readonly number[],
  ): Promise<ReadonlyMap<number, { pending: number; openReports: number }>> {
    if (forumIds.length === 0) return new Map()

    const rows = resultRows(
      await this.db.execute(sql`
        with held as (
          select forum_id, count(*)::int as n from threads
           where forum_id in ${idList(forumIds)} and visibility = ${PENDING_APPROVAL}
           group by forum_id
          union all
          select p.forum_id, count(*)::int from posts p
            join threads t on t.id = p.thread_id
           where p.forum_id in ${idList(forumIds)}
             and p.visibility = ${PENDING_APPROVAL}
             and t.visibility <> ${PENDING_APPROVAL}
             and p.is_first_post = false
           group by p.forum_id
        ),
        reported as (
          select forum_id, count(*)::int as n from reports
           where forum_id in ${idList(forumIds)} and status = 'open'
           group by forum_id
        )
        select f.id as forum_id,
               coalesce((select sum(n) from held where held.forum_id = f.id), 0)::int as pending,
               coalesce((select n from reported where reported.forum_id = f.id), 0)::int as open_reports
          from forums f
         where f.id in ${idList(forumIds)}
      `),
    ) as Array<{ forum_id: number; pending: number; open_reports: number }>

    return new Map(
      rows.map((row) => [
        Number(row.forum_id),
        { pending: Number(row.pending), openReports: Number(row.open_reports) },
      ]),
    )
  }

  async ipPrefixesFor(
    userId: number,
  ): Promise<{ registration: string | null; lastVisit: string | null }> {
    const rows = resultRows(
      await this.db.execute(sql`
        select registration_ip_prefix, last_ip_prefix from users where id = ${userId}
      `),
    ) as Array<{ registration_ip_prefix: string | null; last_ip_prefix: string | null }>
    const row = rows[0]
    if (!row) return { registration: null, lastVisit: null }
    return { registration: row.registration_ip_prefix, lastVisit: row.last_ip_prefix }
  }

  async ipMatches(userId: number, limit: number): Promise<readonly IpMatch[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        with subject as (
          select registration_ip_prefix as reg, last_ip_prefix as last
            from users where id = ${userId}
        )
        select u.id, u.username, u.last_active_at,
               (u.registration_ip_prefix is not null
                 and u.registration_ip_prefix in (
                   (select reg from subject), (select last from subject)
                 )) as by_registration,
               (u.last_ip_prefix is not null
                 and u.last_ip_prefix in (
                   (select reg from subject), (select last from subject)
                 )) as by_last
          from users u, subject s
         where u.id <> ${userId}
           and u.state <> 'deleted'
           and (
             (u.registration_ip_prefix is not null
               and u.registration_ip_prefix in (s.reg, s.last))
             or (u.last_ip_prefix is not null and u.last_ip_prefix in (s.reg, s.last))
           )
         order by u.last_active_at desc nulls last, u.id
         limit ${limit}
      `),
    ) as Array<{
      id: number
      username: string
      last_active_at: Date | null
      by_registration: boolean
      by_last: boolean
    }>

    return rows.map((row) => ({
      userId: Number(row.id),
      username: row.username,
      matchedOn:
        row.by_registration && row.by_last
          ? 'both'
          : row.by_registration
            ? 'registration'
            : 'last_visit',
      lastActiveAt: row.last_active_at === null ? null : new Date(row.last_active_at),
    }))
  }

  async recordIpLookup(input: {
    readonly actorUserId: number
    readonly subjectUserId: number
    readonly matches: number
    readonly at: Date
  }): Promise<void> {
    await this.db.execute(sql`
      insert into admin_log (user_id, action, detail, created_at)
      values (
        ${input.actorUserId},
        'modcp.ip_lookup',
        ${JSON.stringify({
          subjectUserId: input.subjectUserId,
          matches: input.matches,
        })}::jsonb,
        ${input.at}
      )
    `)
  }
}
