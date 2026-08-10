import { sql } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export interface FeedScope {
  readonly forumIds: readonly number[]
  readonly content: ContentScope
}

export interface FeedThread {
  readonly threadId: number
  readonly title: string
  readonly slug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly authorUsername: string
  readonly createdAt: Date
  readonly lastPostAt: Date
  readonly replyCount: number
  readonly excerptSource: string | null
}

export interface FeedPost {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly authorUsername: string
  readonly createdAt: Date
  readonly messageSource: string
}

export interface SitemapForum {
  readonly forumId: number
  readonly slug: string
  readonly lastPostAt: Date | null
}

export interface SitemapThread {
  readonly threadId: number
  readonly slug: string
  readonly lastPostAt: Date
}

const EXCERPT_CHARS = 500

export class PostgresFeedRepository {
  constructor(private readonly db: Database) {}

  async recentThreads(
    limit: number,
    scope: FeedScope,
    forumId?: number,
  ): Promise<readonly FeedThread[]> {
    if (scope.forumIds.length === 0) return []

    const forums =
      forumId === undefined
        ? sql`t.forum_id in (${sql.join(
            scope.forumIds.map((id) => sql`${id}`),
            sql`, `,
          )})`
        :
          sql`t.forum_id = ${forumId} and t.forum_id in (${sql.join(
            scope.forumIds.map((id) => sql`${id}`),
            sql`, `,
          )})`

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.title, t.slug, t.forum_id, f.title as forum_title,
               t.author_username, t.created_at, t.last_post_at, t.reply_count,
               left(p.message, ${EXCERPT_CHARS}) as excerpt
          from threads t
          join forums f on f.id = t.forum_id
          /*
           * The opening post, and left-joined *through the scope*: a thread
           * whose first post was removed is still a thread, and it appears with
           * no summary rather than vanishing from the feed.
           */
          left join posts p
            on p.id = t.first_post_id
           and ${visibleIn(sql`p.visibility`, scope.content)}
         where ${forums}
           and ${visibleIn(sql`t.visibility`, scope.content)}
         order by t.last_post_at desc, t.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      threadId: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      authorUsername: String(row.author_username),
      createdAt: toDate(row.created_at),
      lastPostAt: toDate(row.last_post_at),
      replyCount: Number(row.reply_count),
      excerptSource: row.excerpt === null ? null : String(row.excerpt),
    }))
  }

  async recentPosts(
    threadId: number,
    limit: number,
    scope: FeedScope,
  ): Promise<readonly FeedPost[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.thread_id, t.title as thread_title, t.slug as thread_slug,
               p.author_username, p.created_at, left(p.message, ${EXCERPT_CHARS}) as message
          from posts p
          join threads t on t.id = p.thread_id
         where p.thread_id = ${threadId}
           and t.forum_id in (${sql.join(
             scope.forumIds.map((id) => sql`${id}`),
             sql`, `,
           )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
           and ${visibleIn(sql`p.visibility`, scope.content)}
         order by p.created_at desc, p.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      postId: Number(row.id),
      threadId: Number(row.thread_id),
      threadTitle: String(row.thread_title),
      threadSlug: String(row.thread_slug),
      authorUsername: String(row.author_username),
      createdAt: toDate(row.created_at),
      messageSource: String(row.message),
    }))
  }

  async sitemapForums(scope: FeedScope): Promise<readonly SitemapForum[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select id, slug, last_post_at
          from forums
         where id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and type = 'forum'
         order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      forumId: Number(row.id),
      slug: String(row.slug),
      lastPostAt: row.last_post_at === null ? null : toDate(row.last_post_at),
    }))
  }

  async sitemapThreadCount(scope: FeedScope): Promise<number> {
    if (scope.forumIds.length === 0) return 0

    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as n
          from threads t
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
      `),
    ) as Array<{ n: number }>

    return rows[0]?.n ?? 0
  }

  async sitemapBoundaryId(skip: number, scope: FeedScope): Promise<number | null> {
    if (skip <= 0) return 0
    if (scope.forumIds.length === 0) return null

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id
          from threads t
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
         order by t.id
         offset ${skip - 1}
         limit 1
      `),
    ) as Array<{ id: number }>

    return rows[0]?.id ?? null
  }

  async sitemapThreads(
    afterId: number,
    limit: number,
    scope: FeedScope,
  ): Promise<readonly SitemapThread[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.slug, t.last_post_at
          from threads t
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
           and t.id > ${afterId}
         order by t.id
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      threadId: Number(row.id),
      slug: String(row.slug),
      lastPostAt: toDate(row.last_post_at),
    }))
  }
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}
