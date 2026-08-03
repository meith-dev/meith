/**
 * F75 — the board's statistics.
 *
 * Two halves with opposite costs, and treating them the same is the mistake
 * this file exists to avoid.
 *
 * ## The totals are a rollup
 *
 * `thread_count`, `post_count` and `member_count` are recomputed on a schedule
 * into the `board_stats` singleton, and the page shows `computed_at` beside
 * them. They are not computed per page view, because `member_count` is a count
 * of `users` and the index is the most-requested page on the board — a
 * sequential scan there is the difference between a board that survives its own
 * front page and one that does not.
 *
 * Totals are summed from the **root forums** rather than counted from `threads`
 * and `posts` directly: F38 already maintains a counter per forum and rolls it
 * up the ancestor chain, so a root category's count is the whole subtree's, and
 * summing tens of rows is free. Counting the content tables would be a second
 * opinion that drifts from the numbers every forum row already shows.
 *
 * ## The leaderboards are queries
 *
 * Top posters, most-viewed and most-replied change with every post, and
 * pre-computing them buys nothing: they are `order by … limit 10` over an
 * indexed column. The two thread lists are **permission-filtered**, because a
 * "most viewed threads" table that includes the staff forum is a leak with a
 * ranking. Top posters is not — a post count is on every profile already.
 */
import { sql } from 'drizzle-orm'

import type { ContentScope } from '@forum/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export interface BoardTotals {
  readonly threadCount: number
  readonly postCount: number
  readonly memberCount: number
  readonly newestUserId: number | null
  readonly newestUsername: string | null
  /** Null until the first rollup has run. The page says so rather than showing zeroes. */
  readonly computedAt: Date | null
}

export interface TopPoster {
  readonly userId: number
  readonly username: string
  readonly postCount: number
}

export interface TopThread {
  readonly threadId: number
  readonly title: string
  readonly slug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly viewCount: number
  readonly replyCount: number
}

export interface StatsScope {
  readonly forumIds: readonly number[]
  readonly content: ContentScope
}

export class PostgresStatsRepository {
  constructor(private readonly db: Database) {}

  async readTotals(): Promise<BoardTotals> {
    const rows = resultRows(
      await this.db.execute(sql`
        select thread_count, post_count, member_count,
               newest_user_id, newest_username, computed_at
          from board_stats where id = 1
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    if (row === undefined) {
      /*
       * The migration inserts the singleton, so this is unreachable on a
       * migrated database. It answers rather than throws because the board
       * index renders this panel, and a missing statistics row is not a reason
       * to take the front page down.
       */
      return {
        threadCount: 0,
        postCount: 0,
        memberCount: 0,
        newestUserId: null,
        newestUsername: null,
        computedAt: null,
      }
    }

    return {
      threadCount: Number(row.thread_count),
      postCount: Number(row.post_count),
      memberCount: Number(row.member_count),
      newestUserId: row.newest_user_id === null ? null : Number(row.newest_user_id),
      newestUsername: row.newest_username === null ? null : String(row.newest_username),
      computedAt: row.computed_at === null ? null : toDate(row.computed_at),
    }
  }

  /**
   * Recompute the totals. One statement, run by the scheduled task.
   *
   * The counts come from the **root forums**, which is where F38's ancestor
   * rollup has already accumulated the whole tree, and `type` is not filtered
   * because a category's counters are the sum of its children and a root
   * *forum* holds its own — summing every row whose `parent_id` is null covers
   * both without knowing which is which.
   *
   * The newest member is the most recent *active* account: an account still
   * awaiting e-mail confirmation is not a member of the board yet, and putting
   * it on the front page announces a registration that may never complete.
   */
  async rollUp(now: Date): Promise<BoardTotals> {
    await this.db.execute(sql`
      update board_stats set
        thread_count = coalesce((select sum(thread_count) from forums where parent_id is null), 0),
        post_count = coalesce((select sum(post_count) from forums where parent_id is null), 0),
        member_count = (select count(*) from users where state = 'active'),
        newest_user_id = (select id from users where state = 'active'
                           order by created_at desc, id desc limit 1),
        newest_username = (select username from users where state = 'active'
                            order by created_at desc, id desc limit 1),
        computed_at = ${now},
        updated_at = ${now}
      where id = 1
    `)

    return this.readTotals()
  }

  /**
   * The members with the most posts.
   *
   * Not permission-filtered, deliberately: a post count is on every profile
   * already, and F31's postbit shows it beside every post. Filtering it by
   * which forums a reader can see would mean recomputing every member's count
   * per reader — an aggregate over `posts` per page view — to hide a number
   * that is public everywhere else on the board.
   */
  async topPosters(limit: number): Promise<readonly TopPoster[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, username, post_count
          from users
         where state = 'active' and post_count > 0
         order by post_count desc, id
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      userId: Number(row.id),
      username: String(row.username),
      postCount: Number(row.post_count),
    }))
  }

  /** The most-viewed threads this reader may see. */
  async mostViewed(limit: number, scope: StatsScope): Promise<readonly TopThread[]> {
    return this.topThreads(sql`t.view_count desc, t.id`, limit, scope)
  }

  /** The most-replied threads this reader may see. */
  async mostReplied(limit: number, scope: StatsScope): Promise<readonly TopThread[]> {
    return this.topThreads(sql`t.reply_count desc, t.id`, limit, scope)
  }

  /**
   * Both leaderboards, differing only in the ordering.
   *
   * The permission filter is in the query for F72's reason: ranking a fetched
   * page returns ten threads as four, and the four are not the top four.
   */
  private async topThreads(
    order: ReturnType<typeof sql>,
    limit: number,
    scope: StatsScope,
  ): Promise<readonly TopThread[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.title, t.slug, t.forum_id, f.title as forum_title,
               t.view_count, t.reply_count
          from threads t
          join forums f on f.id = t.forum_id
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
         order by ${order}
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      threadId: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      viewCount: Number(row.view_count),
      replyCount: Number(row.reply_count),
    }))
  }
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}
