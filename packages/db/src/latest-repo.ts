import { sql } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export interface LatestScope {
  readonly forumIds: readonly number[]
  readonly content: ContentScope
}

export interface LatestThreadRow {
  readonly threadId: number
  readonly title: string
  readonly slug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly createdAt: Date
}

export interface LatestPostRow {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly createdAt: Date
  readonly messageSource: string
}

const EXCERPT_CHARS = 300

export class PostgresLatestRepository {
  constructor(private readonly db: Database) {}

  async threads(limit: number, scope: LatestScope): Promise<readonly LatestThreadRow[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.title, t.slug, t.forum_id, f.title as forum_title,
               f.slug as forum_slug, t.author_user_id, t.author_username,
               t.reply_count, t.created_at
          from threads t
          join forums f on f.id = t.forum_id
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
         order by t.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      threadId: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      forumSlug: String(row.forum_slug),
      authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
      authorUsername: String(row.author_username),
      replyCount: Number(row.reply_count),
      createdAt: toDate(row.created_at),
    }))
  }

  async posts(limit: number, scope: LatestScope): Promise<readonly LatestPostRow[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.thread_id, p.author_user_id, p.author_username, p.created_at,
               left(p.message, ${EXCERPT_CHARS}) as message,
               t.title as thread_title, t.slug as thread_slug,
               t.forum_id, f.title as forum_title, f.slug as forum_slug
          from posts p
          join threads t on t.id = p.thread_id
          join forums f on f.id = t.forum_id
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
           and ${visibleIn(sql`p.visibility`, scope.content)}
         order by p.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      postId: Number(row.id),
      threadId: Number(row.thread_id),
      threadTitle: String(row.thread_title),
      threadSlug: String(row.thread_slug),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      forumSlug: String(row.forum_slug),
      authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
      authorUsername: String(row.author_username),
      createdAt: toDate(row.created_at),
      messageSource: String(row.message),
    }))
  }
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}
