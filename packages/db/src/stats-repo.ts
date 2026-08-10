import { sql } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export interface BoardTotals {
  readonly threadCount: number
  readonly postCount: number
  readonly memberCount: number
  readonly newestUserId: number | null
  readonly newestUsername: string | null
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

  async mostViewed(limit: number, scope: StatsScope): Promise<readonly TopThread[]> {
    return this.topThreads(sql`t.view_count desc, t.id`, limit, scope)
  }

  async mostReplied(limit: number, scope: StatsScope): Promise<readonly TopThread[]> {
    return this.topThreads(sql`t.reply_count desc, t.id`, limit, scope)
  }

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
