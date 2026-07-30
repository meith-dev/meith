/** F38 — atomic counters written alongside a newly persisted post. */
import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import type { Database } from './client'

/** The content write has already inserted before this is called. */
export interface CreatedContent {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
  readonly authorId: number | null
  readonly authorUsername: string
  readonly threadTitle: string
  readonly createdAt: Date
  /** The opening post creates one visible thread; replies do not. */
  readonly isNewThread: boolean
}

interface CounterTransaction {
  execute(query: SQLWrapper): Promise<unknown>
}

/**
 * Apply the visible-content counters inside the caller's transaction.
 *
 * This deliberately has no ambient database handle: F39 inserts the thread and
 * post first, then calls this with that same transaction. Splitting those into
 * independent transactions is how a failed request leaves a real post behind
 * while every listing still reports zero.
 */
export async function applyCreatedContentCounters(
  tx: CounterTransaction,
  content: CreatedContent,
): Promise<void> {
  const newer = sql`last_post_at is null or last_post_id is null
    or last_post_at < ${content.createdAt}
    or (last_post_at = ${content.createdAt} and last_post_id < ${content.postId})`
  // A thread row has a default `last_post_at` before its opening post is linked.
  // Its first post therefore wins regardless of the timestamp that default used.
  const threadNewer = content.isNewThread ? sql`true` : newer

  await tx.execute(sql`
    update forums
       set post_count = post_count + 1,
           thread_count = thread_count + ${content.isNewThread ? 1 : 0},
           last_post_id = case when ${newer} then ${content.postId} else last_post_id end,
           last_post_thread_id = case when ${newer} then ${content.threadId} else last_post_thread_id end,
           last_post_thread_title = case when ${newer} then ${content.threadTitle} else last_post_thread_title end,
           last_post_user_id = case when ${newer} then ${content.authorId} else last_post_user_id end,
           last_post_username = case when ${newer} then ${content.authorUsername} else last_post_username end,
           last_post_at = case when ${newer} then ${content.createdAt} else last_post_at end,
           updated_at = now()
     where id = ${content.forumId}
  `)

  await tx.execute(sql`
    update threads
       set first_post_id = case when ${content.isNewThread} then ${content.postId} else first_post_id end,
           reply_count = reply_count + ${content.isNewThread ? 0 : 1},
           last_post_id = case when ${threadNewer} then ${content.postId} else last_post_id end,
           last_post_user_id = case when ${threadNewer} then ${content.authorId} else last_post_user_id end,
           last_post_username = case when ${threadNewer} then ${content.authorUsername} else last_post_username end,
           last_post_at = case when ${threadNewer} then ${content.createdAt} else last_post_at end,
           updated_at = now()
     where id = ${content.threadId}
  `)

  if (content.authorId !== null) {
    await tx.execute(sql`
      update users
         set post_count = post_count + 1,
             thread_count = thread_count + ${content.isNewThread ? 1 : 0},
             updated_at = now()
       where id = ${content.authorId}
    `)
  }

  /*
   * Direct-forum counters are immediately correct for the list page. Ancestor
   * roll-up is asynchronous because one post can touch an arbitrarily deep
   * path; the transactional event makes that later work durable without making
   * the request wait for every parent row.
   */
  await tx.execute(sql`
    insert into outbox (topic, payload)
    values (
      'post.created',
      ${JSON.stringify({
        postId: content.postId,
        threadId: content.threadId,
        forumId: content.forumId,
        authorId: content.authorId,
      })}::jsonb
    )
  `)
}

/** Convenience for an operational import; request writers use the function above. */
export class PostgresContentCounterRepository {
  constructor(private readonly db: Database) {}

  async recordCreated(content: CreatedContent): Promise<void> {
    await this.db.transaction((tx) => applyCreatedContentCounters(tx, content))
  }
}
