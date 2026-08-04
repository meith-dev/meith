/** Postgres forum-display listing (F30), scoped by F47. */
import { and, desc, eq, lt, or } from "drizzle-orm";

import type { ContentScope } from "@meith/core";
import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadPage,
  ThreadRepository,
} from "@meith/threads";

import type { Database } from "./client";
import { threadPrefixes, threads } from "./schema";
import { visibleIn } from "./visibility";

/**
 * The R3.5 partial index begins `(forum_id, is_sticky DESC, last_post_at DESC)`.
 * `id` is the deterministic tie-breaker: timestamps have millisecond precision,
 * so omitting it eventually drops or repeats threads that share an instant.
 */
function after(cursor: ThreadCursor) {
  const olderInSameBucket = or(
    lt(threads.lastPostAt, cursor.lastPostAt),
    and(eq(threads.lastPostAt, cursor.lastPostAt), lt(threads.id, cursor.id)),
  );

  return cursor.isSticky
    ? or(
        eq(threads.isSticky, false),
        and(eq(threads.isSticky, true), olderInSameBucket),
      )
    : and(eq(threads.isSticky, false), olderInSameBucket);
}

function rowToListing(row: {
  id: number;
  forumId: number;
  title: string;
  slug: string;
  prefixLabel: string | null;
  prefixToken: string | null;
  authorUserId: number | null;
  authorUsername: string;
  replyCount: number;
  viewCount: number;
  visibility: string;
  isSticky: boolean;
  isLocked: boolean;
  movedToThreadId: number | null;
  lastPostId: number | null;
  lastPostUserId: number | null;
  lastPostUsername: string | null;
  lastPostAt: Date;
}): ThreadListingRow {
  return {
    id: row.id,
    forumId: row.forumId,
    title: row.title,
    slug: row.slug,
    prefix:
      row.prefixLabel === null
        ? null
        : { label: row.prefixLabel, token: row.prefixToken },
    authorUserId: row.authorUserId,
    authorUsername: row.authorUsername,
    replyCount: row.replyCount,
    viewCount: row.viewCount,
    visibility: row.visibility as ThreadListingRow["visibility"],
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
  };
}

export class PostgresThreadRepository implements ThreadRepository {
  constructor(private readonly db: Database) {}

  /** The forum id alone, unscoped — see the port for why this one is. */
  async locateForum(threadId: number): Promise<number | null> {
    const rows = await this.db
      .select({ forumId: threads.forumId })
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1);
    return rows[0]?.forumId ?? null;
  }

  async findById(id: number, scope: ContentScope): Promise<ThreadListingRow | null> {
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
      .where(and(eq(threads.id, id), visibleIn(threads.visibility, scope)))
      .limit(1)
    const row = rows[0]
    return row ? rowToListing(row) : null
  }

  async listForum(
    forumId: number,
    options: {
      readonly after?: ThreadCursor
      readonly limit: number
      readonly scope: ContentScope
    },
  ): Promise<ThreadPage> {
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
          ...(options.after ? [after(options.after)] : []),
        ),
      )
      .orderBy(
        desc(threads.isSticky),
        desc(threads.lastPostAt),
        desc(threads.id),
      )
      .limit(options.limit + 1);

    const page = rows.slice(0, options.limit).map(rowToListing);
    const last = page.at(-1);
    return {
      rows: page,
      nextCursor:
        rows.length > options.limit && last
          ? {
              isSticky: last.isSticky,
              lastPostAt: last.lastPostAt,
              id: last.id,
            }
          : null,
    };
  }
}
