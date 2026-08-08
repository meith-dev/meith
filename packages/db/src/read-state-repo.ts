/** Durable community/thread read watermarks (F32). */
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'

import { PUBLIC_CONTENT } from '@meith/core'
import type { ReadState, ReadStateRepository } from '@meith/threads'

import type { Database } from './client'
import { communitiesRead, threads, threadsRead } from './schema'
import { visibleIn } from './visibility'

export class PostgresReadStateRepository implements ReadStateRepository {
  constructor(private readonly db: Database) {}

  async forUser(userId: number): Promise<ReadState> {
    const [communities, threadReads, unread] = await Promise.all([
      this.db
        .select({ communityId: communitiesRead.communityId, readAt: communitiesRead.readAt })
        .from(communitiesRead)
        .where(eq(communitiesRead.userId, userId)),
      this.db
        .select({ threadId: threadsRead.threadId, lastReadPostId: threadsRead.lastReadPostId })
        .from(threadsRead)
        .where(eq(threadsRead.userId, userId)),
      this.db
        .selectDistinct({ communityId: threads.communityId })
        .from(threads)
        .leftJoin(
          communitiesRead,
          and(eq(communitiesRead.userId, userId), eq(communitiesRead.communityId, threads.communityId)),
        )
        .leftJoin(
          threadsRead,
          and(eq(threadsRead.userId, userId), eq(threadsRead.threadId, threads.id)),
        )
        .where(
          and(
            /*
             * Public, always (F47). Unread state is about content a member can
             * actually go and read: flagging a community unread because of a post
             * in the moderation queue would send a moderator to a thread that
             * looks identical to the one they already read.
             */
            visibleIn(threads.visibility, PUBLIC_CONTENT),
            sql`${threads.lastPostId} is not null`,
            or(isNull(threadsRead.lastReadPostId), gt(threads.lastPostId, threadsRead.lastReadPostId)),
            or(isNull(communitiesRead.readAt), gt(threads.lastPostAt, communitiesRead.readAt)),
          ),
        ),
    ])

    return {
      communityReadAt: new Map(communities.map((row) => [row.communityId, row.readAt])),
      threadLastPostId: new Map(
        threadReads.flatMap((row) =>
          row.lastReadPostId === null ? [] : [[row.threadId, row.lastReadPostId] as const],
        ),
      ),
      unreadCommunityIds: new Set(unread.map((row) => row.communityId)),
    }
  }

  async markCommunitiesRead(userId: number, communityIds: readonly number[], at: Date): Promise<void> {
    if (communityIds.length === 0) return
    await this.db
      .insert(communitiesRead)
      .values(communityIds.map((communityId) => ({ userId, communityId, readAt: at })))
      .onConflictDoUpdate({
        target: [communitiesRead.userId, communitiesRead.communityId],
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
          // A slower tab must not move the marker backwards.
          lastReadPostId: sql`greatest(coalesce(${threadsRead.lastReadPostId}, 0), excluded.last_read_post_id)`,
          readAt: at,
        },
      })
  }
}
