import { sql } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export const ONLINE_WINDOW_MINUTES = 15

export interface OnlineScope {
  readonly forumIds: readonly number[]
  readonly content: ContentScope
  readonly seesInvisible: boolean
}

export interface OnlineMember {
  readonly userId: number
  readonly username: string
  readonly invisible: boolean
  readonly lastSeenAt: Date
  readonly forumId: number | null
  readonly forumTitle: string | null
  readonly threadId: number | null
  readonly threadTitle: string | null
  readonly threadSlug: string | null
}

export interface OnlineSnapshot {
  readonly members: readonly OnlineMember[]
  readonly guestCount: number
  readonly total: number
  readonly invisibleCount: number
}

export interface OnlineRecord {
  readonly count: number
  readonly at: Date | null
}

export class PostgresPresenceRepository {
  constructor(private readonly db: Database) {}

  async onlineNow(now: Date, scope: OnlineScope): Promise<OnlineSnapshot> {
    const since = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60_000)

    const mayName =
      scope.forumIds.length === 0
        ? sql`false`
        : sql`s.location_forum_id in (${sql.join(
            scope.forumIds.map((id) => sql`${id}`),
            sql`, `,
          )})`

    const mayNameThread = sql`(${mayName} and ${visibleIn(sql`t.visibility`, scope.content)})`

    const rows = resultRows(
      await this.db.execute(sql`
        select distinct on (coalesce(s.user_id, -s.id))
               s.user_id, s.id as session_id, s.last_seen_at,
               u.username, u.invisible,
               case when ${mayName} then s.location_forum_id end as forum_id,
               case when ${mayName} then f.title end as forum_title,
               case when ${mayNameThread} then s.location_thread_id end as thread_id,
               case when ${mayNameThread} then t.title end as thread_title,
               case when ${mayNameThread} then t.slug end as thread_slug
          from sessions s
          left join users u on u.id = s.user_id
          left join forums f on f.id = s.location_forum_id
          left join threads t on t.id = s.location_thread_id
         where s.revoked_at is null
           and s.last_seen_at >= ${since}
           and (s.user_id is null or u.state = 'active')
         order by coalesce(s.user_id, -s.id), s.last_seen_at desc
      `),
    ) as Array<Record<string, unknown>>

    let guestCount = 0
    let invisibleCount = 0
    const members: OnlineMember[] = []

    for (const row of rows) {
      if (row.user_id === null) {
        guestCount += 1
        continue
      }

      const invisible = row.invisible === true
      if (invisible) invisibleCount += 1
      if (invisible && !scope.seesInvisible) continue

      members.push({
        userId: Number(row.user_id),
        username: String(row.username),
        invisible,
        lastSeenAt: toDate(row.last_seen_at),
        forumId: row.forum_id === null ? null : Number(row.forum_id),
        forumTitle: row.forum_title === null ? null : String(row.forum_title),
        threadId: row.thread_id === null ? null : Number(row.thread_id),
        threadTitle: row.thread_title === null ? null : String(row.thread_title),
        threadSlug: row.thread_slug === null ? null : String(row.thread_slug),
      })
    }

    return {
      members,
      guestCount,
      total: guestCount + members.length,
      invisibleCount: scope.seesInvisible ? invisibleCount : 0,
    }
  }

  async concurrentCount(now: Date): Promise<number> {
    const since = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60_000)
    const rows = resultRows(
      await this.db.execute(sql`
        select count(distinct coalesce(s.user_id, -s.id))::int as n
          from sessions s
         where s.revoked_at is null and s.last_seen_at >= ${since}
      `),
    ) as Array<{ n: number }>

    return rows[0]?.n ?? 0
  }

  async recordIfHigher(count: number, now: Date): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        update board_stats
           set most_online_count = ${count},
               most_online_at = ${now},
               updated_at = ${now}
         where id = 1 and most_online_count < ${count}
        returning most_online_count
      `),
    ) as Array<unknown>

    return rows.length > 0
  }

  async readRecord(): Promise<OnlineRecord> {
    const rows = resultRows(
      await this.db.execute(sql`
        select most_online_count, most_online_at from board_stats where id = 1
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    if (row === undefined) return { count: 0, at: null }
    return {
      count: Number(row.most_online_count),
      at: row.most_online_at === null ? null : toDate(row.most_online_at),
    }
  }
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}
