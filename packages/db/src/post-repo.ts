import { and, asc, eq, gt, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { PUBLIC_CONTENT, type ContentScope } from '@meith/core'
import { sourceAsMarkdown } from '@meith/markdown'
import type {
  PostListingRow,
  PostLocation,
  PostPage,
  PostRepository,
  QuotablePost,
} from '@meith/posts'

import type { Database } from './client'
import { posts, users } from './schema'
import { visibleIn } from './visibility'

const editors = alias(users, 'editors')

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
  bodyFormat: number
  isFirstPost: boolean
  visibility: string
  createdAt: Date
  editedAt: Date | null
  editedByUsername: string | null
  editReason: string | null
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
    bodyFormat: Number(row.bodyFormat),
    isFirstPost: row.isFirstPost,
    visibility: row.visibility as PostListingRow['visibility'],
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    editedByUsername: row.editedByUsername,
    editReason: row.editReason,
  }
}

export class PostgresPostRepository implements PostRepository {
  constructor(private readonly db: Database) {}

  async findQuotable(threadId: number, postId: number): Promise<QuotablePost | null> {
    const rows = await this.db
      .select({
        id: posts.id,
        authorUsername: posts.authorUsername,
        message: posts.message,
        bodyFormat: posts.bodyFormat,
      })
      .from(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.threadId, threadId),
          visibleIn(posts.visibility, PUBLIC_CONTENT),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (row === undefined) return null
    return {
      id: row.id,
      authorUsername: row.authorUsername,
      message: sourceAsMarkdown(row.message, Number(row.bodyFormat)),
    }
  }

  async locate(
    threadId: number,
    postId: number,
    options: { readonly scope: ContentScope; readonly pageSize: number },
  ): Promise<PostLocation | null> {
    const visible: SQL = visibleIn(posts.visibility, options.scope)
    const size = Math.max(1, Math.trunc(options.pageSize))

    const counted = await this.db
      .select({
        number: sql<number>`count(*) filter (where ${posts.id} <= ${postId})::int`,
        found: sql<number>`count(*) filter (where ${posts.id} = ${postId})::int`,
      })
      .from(posts)
      .where(and(eq(posts.threadId, threadId), visible))

    const row = counted[0]
    if (row === undefined || Number(row.found) === 0) return null

    const number = Number(row.number)
    const page = Math.floor((number - 1) / size) + 1
    if (page === 1) return { number, page, afterId: null }

    const cursor = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.threadId, threadId), visible))
      .orderBy(asc(posts.id))
      .limit(1)
      .offset((page - 1) * size - 1)

    return { number, page, afterId: cursor[0]?.id ?? null }
  }

  async findVisibleById(threadId: number, postId: number): Promise<number | null> {
    const rows = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.threadId, threadId),
          eq(posts.id, postId),
          visibleIn(posts.visibility, PUBLIC_CONTENT),
        ),
      )
      .limit(1)
    return rows[0]?.id ?? null
  }

  async listThread(
    threadId: number,
    options: {
      readonly afterId?: number
      readonly limit: number
      readonly scope: ContentScope
    },
  ): Promise<PostPage> {
    const visible: SQL = visibleIn(posts.visibility, options.scope)

    const beforeCount = options.afterId
      ? sql<number>`(
          select count(*)::int from ${posts}
          where ${posts.threadId} = ${threadId}
            and ${visible}
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
        bodyFormat: posts.bodyFormat,
        isFirstPost: posts.isFirstPost,
        visibility: posts.visibility,
        createdAt: posts.createdAt,
        editedAt: posts.editedAt,
        editedByUsername: editors.username,
        editReason: posts.editReason,
      })
      .from(posts)
      .leftJoin(users, eq(posts.authorUserId, users.id))
      .leftJoin(editors, eq(posts.editedByUserId, editors.id))
      .where(
        and(
          eq(posts.threadId, threadId),
          visible,
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
