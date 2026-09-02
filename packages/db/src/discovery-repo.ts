import { type SQL, sql } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { audienceIsEmpty, inAudience } from './thread-audience'
import { visibleIn } from './visibility'

export interface DiscoveryScope {
  readonly forumIds: readonly number[]
  readonly ownThreadsOnlyForumIds: readonly number[]
  readonly content: ContentScope
  readonly viewerUserId: number | null
}

export interface DiscoveryRow {
  readonly threadId: number
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly title: string
  readonly slug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly lastPostAt: Date
  readonly lastPostUsername: string | null
}

export interface DiscoveryPage {
  readonly rows: readonly DiscoveryRow[]
  readonly nextCursor: { readonly at: Date; readonly threadId: number } | null
}

export interface DiscoveryQuery {
  readonly limit: number
  readonly after: { readonly at: Date; readonly threadId: number } | null
}

export class PostgresDiscoveryRepository {
  constructor(private readonly db: Database) {}

  async activeSince(
    since: Date,
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    return this.page([sql`t.last_post_at >= ${since}`], query, scope)
  }

  async unanswered(query: DiscoveryQuery, scope: DiscoveryScope): Promise<DiscoveryPage> {
    return this.page([sql`t.reply_count = 0`], query, scope)
  }

  async startedBy(
    userId: number,
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    return this.page([sql`t.author_user_id = ${userId}`], query, scope)
  }

  async participatedIn(
    userId: number,
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    return this.page(
      [
        sql`exists (
          select 1 from posts p
           where p.thread_id = t.id and p.author_user_id = ${userId}
             and ${visibleIn(sql`p.visibility`, scope.content)}
        )`,
      ],
      query,
      scope,
    )
  }

  async unread(
    userId: number,
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    return this.page(
      [
        sql`t.last_post_id is not null`,
        sql`(tr.last_read_post_id is null or t.last_post_id > tr.last_read_post_id)`,
        sql`(fr.read_at is null or t.last_post_at > fr.read_at)`,
      ],
      query,
      scope,
      [
        sql`left join threads_read tr on tr.thread_id = t.id and tr.user_id = ${userId}`,
        sql`left join forums_read fr on fr.forum_id = t.forum_id and fr.user_id = ${userId}`,
      ],
    )
  }

  private async page(
    conditions: readonly SQL[],
    query: DiscoveryQuery,
    scope: DiscoveryScope,
    joins: readonly SQL[] = [],
  ): Promise<DiscoveryPage> {
    if (audienceIsEmpty(scope)) return { rows: [], nextCursor: null }

    const where: SQL[] = [
      inAudience(sql`t.forum_id`, sql`t.author_user_id`, scope),
      visibleIn(sql`t.visibility`, scope.content),
      ...conditions,
    ]

    if (query.after !== null) {
      where.push(
        sql`(t.last_post_at < ${query.after.at}
             or (t.last_post_at = ${query.after.at} and t.id < ${query.after.threadId}))`,
      )
    }

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id as thread_id, t.forum_id, f.title as forum_title,
               f.slug as forum_slug,
               t.title, t.slug, t.author_user_id, t.author_username,
               t.reply_count, t.last_post_at, t.last_post_username
          from threads t
          join forums f on f.id = t.forum_id
          ${sql.join([...joins], sql` `)}
         where ${sql.join(where, sql` and `)}
         order by t.last_post_at desc, t.id desc
         limit ${query.limit}
      `),
    ) as Array<Record<string, unknown>>

    const mapped: DiscoveryRow[] = rows.map((row) => ({
      threadId: Number(row.thread_id),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      forumSlug: String(row.forum_slug),
      title: String(row.title),
      slug: String(row.slug),
      authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
      authorUsername: String(row.author_username),
      replyCount: Number(row.reply_count),
      lastPostAt:
        row.last_post_at instanceof Date ? row.last_post_at : new Date(String(row.last_post_at)),
      lastPostUsername: row.last_post_username === null ? null : String(row.last_post_username),
    }))

    const last = mapped.at(-1)
    return {
      rows: mapped,
      nextCursor:
        mapped.length < query.limit || last === undefined
          ? null
          : { at: last.lastPostAt, threadId: last.threadId },
    }
  }
}
