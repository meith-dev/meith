/** Postgres thread-view listing (F31), widened for moderators at F41. */
import { and, asc, eq, gt, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { PUBLIC_CONTENT, type ContentScope } from '@forum/core'
import type {
  PostListingRow,
  PostPage,
  PostRepository,
  QuotablePost,
} from '@forum/posts'

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
          /*
           * Public, whoever is asking. Quoting is how a post is put back in
           * front of everybody, so a moderator quoting a removed post would
           * republish it — with the moderator's name on it.
           */
          visibleIn(posts.visibility, PUBLIC_CONTENT),
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
    /*
     * One predicate, used by both the page slice and the "how many came before"
     * subquery. Two spellings of it is how a moderator's page ends up numbered
     * from the member's set — off by exactly the number of hidden posts above.
     */
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
