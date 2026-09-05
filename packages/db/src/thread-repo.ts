import { and, desc, eq, lt, or, sql } from 'drizzle-orm'

import type { ContentScope, ThreadAuthorFilter } from '@meith/core'
import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadLocation,
  ThreadPage,
  ThreadRepository,
  ThreadSort,
} from '@meith/threads'

import type { Database } from './client'
import { threadPrefixes, threads } from './schema'
import { authoredBy } from './thread-audience'
import { visibleIn } from './visibility'

function afterActivity(cursor: ThreadCursor) {
  const olderInSameBucket = or(
    lt(threads.lastPostAt, cursor.lastPostAt),
    and(eq(threads.lastPostAt, cursor.lastPostAt), lt(threads.id, cursor.id)),
  )

  return cursor.isSticky
    ? or(eq(threads.isSticky, false), and(eq(threads.isSticky, true), olderInSameBucket))
    : and(eq(threads.isSticky, false), olderInSameBucket)
}

function afterRating(cursor: ThreadCursor) {
  const sameRating =
    cursor.ratingCount === 0
      ? eq(threads.ratingCount, 0)
      : sql<boolean>`
          (${threads.ratingCount} > 0 and
           ${threads.ratingTotal} * ${cursor.ratingCount} = ${cursor.ratingTotal} * ${threads.ratingCount})
        `
  const lowerRating =
    cursor.ratingCount === 0
      ? sql<boolean>`false`
      : sql<boolean>`
          ${threads.ratingCount} = 0 or
          (${threads.ratingCount} > 0 and
           ${threads.ratingTotal} * ${cursor.ratingCount} < ${cursor.ratingTotal} * ${threads.ratingCount})
        `
  const olderInSameBucket = or(
    lowerRating,
    and(
      sameRating,
      or(
        lt(threads.ratingCount, cursor.ratingCount),
        and(eq(threads.ratingCount, cursor.ratingCount), lt(threads.lastPostAt, cursor.lastPostAt)),
        and(
          eq(threads.ratingCount, cursor.ratingCount),
          eq(threads.lastPostAt, cursor.lastPostAt),
          lt(threads.id, cursor.id),
        ),
      ),
    ),
  )

  return cursor.isSticky
    ? or(eq(threads.isSticky, false), and(eq(threads.isSticky, true), olderInSameBucket))
    : and(eq(threads.isSticky, false), olderInSameBucket)
}

function rowToListing(row: {
  id: number
  forumId: number
  title: string
  slug: string
  prefixLabel: string | null
  prefixToken: string | null
  authorUserId: number | null
  authorUsername: string
  replyCount: number
  viewCount: number
  ratingTotal: number
  ratingCount: number
  visibility: string
  isSticky: boolean
  isLocked: boolean
  movedToThreadId: number | null
  lastPostId: number | null
  lastPostUserId: number | null
  lastPostUsername: string | null
  lastPostAt: Date
}): ThreadListingRow {
  return {
    id: row.id,
    forumId: row.forumId,
    title: row.title,
    slug: row.slug,
    prefix: row.prefixLabel === null ? null : { label: row.prefixLabel, token: row.prefixToken },
    authorUserId: row.authorUserId,
    authorUsername: row.authorUsername,
    replyCount: row.replyCount,
    viewCount: row.viewCount,
    ratingTotal: row.ratingTotal,
    ratingCount: row.ratingCount,
    visibility: row.visibility as ThreadListingRow['visibility'],
    isSticky: row.isSticky,
    isLocked: row.isLocked,
    isMoved: row.movedToThreadId !== null,
    lastPost:
      row.lastPostId === null || row.lastPostUsername === null
        ? null
        : {
            postId: row.lastPostId,
            userId: row.lastPostUserId,
            username: row.lastPostUsername,
            at: row.lastPostAt,
          },
    lastPostAt: row.lastPostAt,
  }
}

export class PostgresThreadRepository implements ThreadRepository {
  constructor(private readonly db: Database) {}

  async locate(threadId: number): Promise<ThreadLocation | null> {
    const rows = await this.db
      .select({
        forumId: threads.forumId,
        authorUserId: threads.authorUserId,
        visibility: threads.visibility,
      })
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1)
    const row = rows[0]
    return row
      ? {
          forumId: row.forumId,
          authorUserId: row.authorUserId,
          visibility: row.visibility as ThreadLocation['visibility'],
        }
      : null
  }

  async findById(
    id: number,
    scope: ContentScope,
    authors: ThreadAuthorFilter,
  ): Promise<ThreadListingRow | null> {
    const rows = await this.db
      .select({
        id: threads.id,
        forumId: threads.forumId,
        title: threads.title,
        slug: threads.slug,
        prefixLabel: threadPrefixes.label,
        prefixToken: threadPrefixes.token,
        authorUserId: threads.authorUserId,
        authorUsername: threads.authorUsername,
        replyCount: threads.replyCount,
        viewCount: threads.viewCount,
        ratingTotal: threads.ratingTotal,
        ratingCount: threads.ratingCount,
        visibility: threads.visibility,
        isSticky: threads.isSticky,
        isLocked: threads.isLocked,
        movedToThreadId: threads.movedToThreadId,
        lastPostId: threads.lastPostId,
        lastPostUserId: threads.lastPostUserId,
        lastPostUsername: threads.lastPostUsername,
        lastPostAt: threads.lastPostAt,
      })
      .from(threads)
      .leftJoin(threadPrefixes, eq(threads.prefixId, threadPrefixes.id))
      .where(
        and(
          eq(threads.id, id),
          visibleIn(threads.visibility, scope),
          authoredBy(threads.authorUserId, authors),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row ? rowToListing(row) : null
  }

  async listForum(
    forumId: number,
    options: {
      readonly after?: ThreadCursor
      readonly offset?: number
      readonly limit: number
      readonly scope: ContentScope
      readonly authors: ThreadAuthorFilter
      readonly sort?: ThreadSort
    },
  ): Promise<ThreadPage> {
    const sort = options.sort ?? 'activity'
    const rows = await this.db
      .select({
        id: threads.id,
        forumId: threads.forumId,
        title: threads.title,
        slug: threads.slug,
        prefixLabel: threadPrefixes.label,
        prefixToken: threadPrefixes.token,
        authorUserId: threads.authorUserId,
        authorUsername: threads.authorUsername,
        replyCount: threads.replyCount,
        viewCount: threads.viewCount,
        ratingTotal: threads.ratingTotal,
        ratingCount: threads.ratingCount,
        visibility: threads.visibility,
        isSticky: threads.isSticky,
        isLocked: threads.isLocked,
        movedToThreadId: threads.movedToThreadId,
        lastPostId: threads.lastPostId,
        lastPostUserId: threads.lastPostUserId,
        lastPostUsername: threads.lastPostUsername,
        lastPostAt: threads.lastPostAt,
      })
      .from(threads)
      .leftJoin(threadPrefixes, eq(threads.prefixId, threadPrefixes.id))
      .where(
        and(
          eq(threads.forumId, forumId),
          visibleIn(threads.visibility, options.scope),
          authoredBy(threads.authorUserId, options.authors),
          ...(options.after
            ? [sort === 'rating' ? afterRating(options.after) : afterActivity(options.after)]
            : []),
        ),
      )
      .orderBy(
        desc(threads.isSticky),
        ...(sort === 'rating'
          ? [
              desc(
                sql`coalesce(${threads.ratingTotal}::numeric / nullif(${threads.ratingCount}, 0), -1)`,
              ),
              desc(threads.ratingCount),
            ]
          : []),
        desc(threads.lastPostAt),
        desc(threads.id),
      )
      .limit(options.limit + 1)
      .offset(options.offset ?? 0)

    const page = rows.slice(0, options.limit).map(rowToListing)
    const last = page.at(-1)
    return {
      rows: page,
      nextCursor:
        rows.length > options.limit && last
          ? {
              sort,
              isSticky: last.isSticky,
              lastPostAt: last.lastPostAt,
              ratingTotal: last.ratingTotal,
              ratingCount: last.ratingCount,
              id: last.id,
            }
          : null,
    }
  }
}
