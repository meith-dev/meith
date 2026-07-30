/** Postgres thread-view listing (F31). */
import { and, asc, eq, gt, sql } from 'drizzle-orm'

import type {
  PostListingRow,
  PostPage,
  PostRepository,
  QuotablePost,
} from '@forum/posts'

import type { Database } from './client'
import { posts, users } from './schema'

function toPost(row: {
  id: number
  threadId: number
  forumId: number
  beforeCount: number
  authorUserId: number | null
  authorUsername: string
  authorPostCount: number | null
  authorJoinedAt: Date | null
  message: string
  messageHtml: string | null
  renderVersion: number
  isFirstPost: boolean
  createdAt: Date
}): PostListingRow {
  return {
    id: row.id,
    threadId: row.threadId,
    forumId: row.forumId,
    number: Number(row.beforeCount) + 1,
    authorUserId: row.authorUserId,
    authorUsername: row.authorUsername,
    authorPostCount: row.authorPostCount ?? 0,
    authorJoinedAt: row.authorJoinedAt,
    message: row.message,
    messageHtml: row.messageHtml,
    renderVersion: Number(row.renderVersion),
    isFirstPost: row.isFirstPost,
    visibility: 'visible',
    createdAt: row.createdAt,
  }
}

export class PostgresPostRepository implements PostRepository {
  constructor(private readonly db: Database) {}

  /** F40's quote source: one visible post in one thread, body included. */
  async findQuotable(threadId: number, postId: number): Promise<QuotablePost | null> {
    const rows = await this.db
      .select({
        id: posts.id,
        authorUsername: posts.authorUsername,
        message: posts.message,
      })
      .from(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.threadId, threadId),
          eq(posts.visibility, 'visible'),
        ),
      )
      .limit(1)

    return rows[0] ?? null
  }

  async findVisibleById(threadId: number, postId: number): Promise<number | null> {
    const rows = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.threadId, threadId),
          eq(posts.id, postId),
          eq(posts.visibility, 'visible'),
        ),
      )
      .limit(1)
    return rows[0]?.id ?? null
  }

  async listThread(
    threadId: number,
    options: { readonly afterId?: number; readonly limit: number },
  ): Promise<PostPage> {
    const beforeCount = options.afterId
      ? sql<number>`(
          select count(*)::int from ${posts}
          where ${posts.threadId} = ${threadId}
            and ${posts.visibility} = 'visible'
            and ${posts.id} <= ${options.afterId}
        )`
      : sql<number>`0`

    const rows = await this.db
      .select({
        id: posts.id,
        threadId: posts.threadId,
        forumId: posts.forumId,
        beforeCount,
        authorUserId: posts.authorUserId,
        authorUsername: posts.authorUsername,
        authorPostCount: users.postCount,
        authorJoinedAt: users.createdAt,
        message: posts.message,
        messageHtml: posts.messageHtml,
        renderVersion: posts.renderVersion,
        isFirstPost: posts.isFirstPost,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .leftJoin(users, eq(posts.authorUserId, users.id))
      .where(
        and(
          eq(posts.threadId, threadId),
          eq(posts.visibility, 'visible'),
          ...(options.afterId ? [gt(posts.id, options.afterId)] : []),
        ),
      )
      .orderBy(asc(posts.id))
      .limit(options.limit + 1)

    const page = rows
      .slice(0, options.limit)
      .map((row, index) => toPost({ ...row, beforeCount: Number(row.beforeCount) + index }))
    const last = page.at(-1)
    return {
      rows: page,
      nextAfterId: rows.length > options.limit && last ? last.id : null,
    }
  }
}
