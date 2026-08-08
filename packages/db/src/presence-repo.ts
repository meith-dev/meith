/**
 * F75 — who is on the board right now, and where.
 *
 * The data has been written since F17: `sessions.last_seen_at` and the three
 * `location_*` columns, updated at most once a minute by a conditional UPDATE
 * whose throttle is its own `where` clause. This is their first reader.
 *
 * ## Why sessions rather than `users.last_active_at`
 *
 * Both exist and they answer different questions. `last_active_at` is *when
 * this account was last seen*, which is what a profile shows. A session row is
 * *a visitor who is here now*, which is what an online list shows — and it is
 * the only one of the two that can count guests at all, or say what anybody is
 * looking at.
 *
 * ## The location is resolved against the viewer, not the visitor
 *
 * This is the whole privacy story and it is easy to get backwards. The session
 * records where its owner is; the panel must describe that in terms of what the
 * *reader* is allowed to know. So the row carries the forum and thread ids and
 * the repository returns them **only when they are in the reader's scope** —
 * everything else becomes a bare "Viewing a forum". Returning the title and
 * letting the page decide would put a private forum's name in a view model that
 * a theme, a feed or a debug dump could print.
 *
 * ## Invisible members are absent from the count as well as the list
 *
 * Removing somebody from the list while still counting them makes invisibility
 * a puzzle solved by subtraction: "eleven online, ten listed" names them as
 * surely as printing their name. Staff see them, marked, because moderating
 * requires knowing who is present.
 */
import { sql } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

/** How long after their last request a visitor is still "online". */
export const ONLINE_WINDOW_MINUTES = 15

export interface OnlineScope {
  /** Forums whose names this reader may be told, from `forumIdsWhere` (F47). */
  readonly forumIds: readonly number[]
  /**
   * The reader's content scope, for the thread title.
   *
   * A visible forum can hold a thread that is not: somebody reading a
   * soft-deleted thread they moderate must not put its title in front of
   * everybody else on the index.
   */
  readonly content: ContentScope
  /** Staff see invisible members, marked. Nobody else knows they exist. */
  readonly seesInvisible: boolean
}

export interface OnlineMember {
  readonly userId: number
  readonly username: string
  readonly invisible: boolean
  readonly lastSeenAt: Date
  /**
   * Where they are, already filtered.
   *
   * `forumId`/`threadId` are null when the reader may not see that forum — not
   * because the session did not record them. The page renders "Viewing a
   * forum" for that, which is true and says nothing.
   */
  readonly forumId: number | null
  readonly forumTitle: string | null
  readonly threadId: number | null
  readonly threadTitle: string | null
  readonly threadSlug: string | null
}

export interface OnlineSnapshot {
  readonly members: readonly OnlineMember[]
  readonly guestCount: number
  /** Members plus guests, as the reader is permitted to count them. */
  readonly total: number
  /** Hidden members, for staff. Always 0 for everybody else. */
  readonly invisibleCount: number
}

export interface OnlineRecord {
  readonly count: number
  readonly at: Date | null
}

export class PostgresPresenceRepository {
  constructor(private readonly db: Database) {}

  /**
   * Everybody here in the last `ONLINE_WINDOW_MINUTES`.
   *
   * One query. A session per visitor, not a row per request, and the location
   * joins are `left` because a visitor on the board index has no forum and a
   * visitor in a forum has no thread — an inner join would quietly drop
   * everybody who is not reading a thread, which is most of them.
   *
   * **One row per member, not per session.** Somebody with a phone and a laptop
   * is one person online; `distinct on` keeps their most recent session, which
   * is also the one whose location is current.
   */
  async onlineNow(now: Date, scope: OnlineScope): Promise<OnlineSnapshot> {
    const since = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60_000)

    /*
     * The forum filter is a value rather than a fragment when the list is
     * empty: `in ()` is a syntax error, and `false` is the honest reading —
     * this reader may be told about no forum at all.
     */
    const mayName =
      scope.forumIds.length === 0
        ? sql`false`
        : sql`s.location_forum_id in (${sql.join(
            scope.forumIds.map((id) => sql`${id}`),
            sql`, `,
          )})`

    /*
     * The thread needs both: its forum must be nameable *and* the thread itself
     * must be in the reader's content scope. The forum check alone would name a
     * soft-deleted thread that a moderator is reading.
     */
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
      /*
       * Dropped before the count is taken, not after. See the header: a member
       * who is subtracted from the list but not from the total is not hidden.
       */
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

  /**
   * The true count, for the record — invisible members included.
   *
   * A separate, cheaper query than `onlineNow` because the record is about how
   * busy the board was, not about who anybody may see. Counting only visible
   * members would make the record depend on how many people had the preference
   * set, which is not a fact about the board.
   */
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

  /**
   * Raise the record if this beat it.
   *
   * The comparison is the `where`, so two peaks arriving together keep the
   * higher one — and that is the only case where this differs from reading the
   * record and writing it back, which is to say the only case worth writing
   * code for. Returns whether the record moved.
   */
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
