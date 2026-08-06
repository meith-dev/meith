import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'

import { PUBLIC_CONTENT } from '@meith/core'
import type { ReadState, ReadStateRepository } from '@meith/threads'

import type { Database } from './client'
import { forumsRead, threads, threadsRead } from './schema'
import { visibleIn } from './visibility'

export class PostgresReadStateRepository implements ReadStateRepository {
  constructor(private readonly db: Database) {}

  async forUser(userId: number): Promise<ReadState> {
    const [forums, threadReads, unread] = await Promise.all([
      this.db
        .select({ forumId: forumsRead.forumId, readAt: forumsRead.readAt })
        .from(forumsRead)
        .where(eq(forumsRead.userId, userId)),
      this.db
        .select({ threadId: threadsRead.threadId, lastReadPostId: threadsRead.lastReadPostId })
        .from(threadsRead)
        .where(eq(threadsRead.userId, userId)),
      this.db
        .selectDistinct({ forumId: threads.forumId })
        .from(threads)
        .leftJoin(
          forumsRead,
          and(eq(forumsRead.userId, userId), eq(forumsRead.forumId, threads.forumId)),
        )
        .leftJoin(
          threadsRead,
          and(eq(threadsRead.userId, userId), eq(threadsRead.threadId, threads.id)),
        )
        .where(
          and(
            visibleIn(threads.visibility, PUBLIC_CONTENT),
            sql`${threads.lastPostId} is not null`,
            or(isNull(threadsRead.lastReadPostId), gt(threads.lastPostId, threadsRead.lastReadPostId)),
            or(isNull(forumsRead.readAt), gt(threads.lastPostAt, forumsRead.readAt)),
          ),
        ),
    ])

    return {
      forumReadAt: new Map(forums.map((row) => [row.forumId, row.readAt])),
      threadLastPostId: new Map(
        threadReads.flatMap((row) =>
          row.lastReadPostId === null ? [] : [[row.threadId, row.lastReadPostId] as const],
        ),
      ),
      unreadForumIds: new Set(unread.map((row) => row.forumId)),
    }
  }

  async markForumsRead(userId: number, forumIds: readonly number[], at: Date): Promise<void> {
    if (forumIds.length === 0) return
    await this.db
      .insert(forumsRead)
      .values(forumIds.map((forumId) => ({ userId, forumId, readAt: at })))
      .onConflictDoUpdate({
        target: [forumsRead.userId, forumsRead.forumId],
        set: { readAt: at },
      })
  }

  async markThreadRead(userId: number, threadId: number, postId: number, at: Date): Promise<void> {
    await this.db
      .insert(threadsRead)
      .values({ userId, threadId, lastReadPostId: postId, readAt: at })
      .onConflictDoUpdate({
        target: [threadsRead.userId, threadsRead.threadId],
        set: {
          lastReadPostId: sql`greatest(coalesce(${threadsRead.lastReadPostId}, 0), excluded.last_read_post_id)`,
          readAt: at,
        },
      })
  }
}
