import { and, asc, eq, gt, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { type ContentScope, PUBLIC_CONTENT } from '@meith/core'
import { sourceAsMarkdown } from '@meith/markdown'
import type {
  PostListingRow,
  PostLocation,
  PostPage,
  PostRepository,
  PostRevision,
  QuotablePost,
} from '@meith/posts'

import type { Database } from './client'
import { resultRows } from './result-rows'
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

  async findRatingTarget(postId: number) {
    const rows = await this.db
      .select({ id: posts.id, threadId: posts.threadId, authorUserId: posts.authorUserId })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1)
    return rows[0] ?? null
  }

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

  async listRevisions(threadId: number, postId: number): Promise<readonly PostRevision[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select r.revision, r.message, r.subject, r.edited_by_user_id,
               coalesce(u.username, 'Deleted member') as edited_by_username,
               r.edit_reason, r.created_at, false as current
          from post_revisions r
          left join users u on u.id = r.edited_by_user_id
         where r.post_id = ${postId}
           and exists (select 1 from posts p where p.id = r.post_id and p.thread_id = ${threadId})
        union all
        select p.revision_count, p.message, p.subject, p.edited_by_user_id,
               coalesce(u.username, p.author_username, 'Deleted member'),
               p.edit_reason, coalesce(p.edited_at, p.created_at), true
          from posts p
          left join users u on u.id = p.edited_by_user_id
         where p.id = ${postId} and p.thread_id = ${threadId}
        order by revision asc
      `),
    ) as Array<{
      revision: number
      message: string
      subject: string | null
      edited_by_user_id: number | null
      edited_by_username: string
      edit_reason: string | null
      created_at: Date | string
      current: boolean
    }>

    return rows.map((row) => ({
      revision: Number(row.revision),
      message: row.message,
      subject: row.subject,
      editedByUserId: row.edited_by_user_id === null ? null : Number(row.edited_by_user_id),
      editedByUsername: row.edited_by_username,
      reason: row.edit_reason,
      createdAt: new Date(row.created_at),
      current: row.current,
    }))
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

  async locateFirstUnread(
    threadId: number,
    after: { readonly postId: number; readonly since: Date | null },
    options: { readonly scope: ContentScope; readonly pageSize: number },
  ): Promise<PostLocation | null> {
    const visible: SQL = visibleIn(posts.visibility, options.scope)

    const target = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.threadId, threadId),
          visible,
          gt(posts.id, after.postId),
          ...(after.since === null ? [] : [gt(posts.createdAt, after.since)]),
        ),
      )
      .orderBy(asc(posts.id))
      .limit(1)

    const firstId = target[0]?.id
    if (firstId === undefined) return null
    return this.locate(threadId, firstId, options)
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
      readonly offset?: number
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
      .offset(options.offset ?? 0)

    const skipped = options.offset ?? 0
    const page = rows
      .slice(0, options.limit)
      .map((row, index) =>
        toPost({ ...row, beforeCount: Number(row.beforeCount) + skipped + index }),
      )
    const last = page.at(-1)
    return {
      rows: page,
      nextAfterId: rows.length > options.limit && last ? last.id : null,
    }
  }
}
