/** F38 — atomic counters written alongside a newly persisted post. */
import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { applyAncestorVisibilityChange } from './visibility-counters'

/** The content write has already inserted before this is called. */
export interface CreatedContent {
  readonly postId: number
  readonly threadId: number
  readonly communityId: number
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
    update communities
       set post_count = post_count + 1,
           thread_count = thread_count + ${content.isNewThread ? 1 : 0},
           last_post_id = case when ${newer} then ${content.postId} else last_post_id end,
           last_post_thread_id = case when ${newer} then ${content.threadId} else last_post_thread_id end,
           last_post_thread_title = case when ${newer} then ${content.threadTitle} else last_post_thread_title end,
           last_post_user_id = case when ${newer} then ${content.authorId} else last_post_user_id end,
           last_post_username = case when ${newer} then ${content.authorUsername} else last_post_username end,
           last_post_at = case when ${newer} then ${content.createdAt} else last_post_at end,
           updated_at = now()
     where id = ${content.communityId}
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
   * Direct-community counters are immediately correct for the list page. Ancestor
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
        communityId: content.communityId,
        authorId: content.authorId,
      })}::jsonb
    )
  `)
}

/**
 * Add a created post to its community's **ancestors**.
 *
 * Community counters are subtree-inclusive: a category shows the totals of
 * everything beneath it, which is what makes the board index's category rows
 * mean anything. The posting community is counted synchronously (above) because the
 * page the author lands on must be right; ancestors are counted here, from the
 * `post.created` event, because a post four levels deep would otherwise make
 * every reply update four rows inside the request.
 *
 * Idempotent against replay. The outbox relay is at-least-once by construction
 * (F07), and this is a delta — so the ledger insert and the update share one
 * transaction, and a redelivered event finds its post id already present and
 * changes nothing. Returns whether the roll-up was applied by *this* call.
 */
export async function rollUpAncestorCounters(
  db: Database,
  postId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    /*
     * Claim and filter in one statement. No row comes back in three distinct
     * cases — already rolled up, post deleted since the event was written, post
     * not visible (moderated) — and all three mean the same thing here. A
     * post that is approved later is counted by F41's visibility transition,
     * not by re-running this.
     */
    const claimed = await tx.execute(sql`
      insert into content_counter_rollups (post_id)
      select p.id from posts p
       where p.id = ${postId} and p.visibility = 'visible'
      on conflict (post_id) do nothing
      returning post_id
    `)
    if (resultRows(claimed).length === 0) return false

    const found = await tx.execute(sql`
      select p.thread_id, p.community_id, p.author_user_id, p.author_username,
             p.created_at, p.is_first_post, t.title as thread_title
        from posts p
        join threads t on t.id = p.thread_id
       where p.id = ${postId}
    `)
    const post = resultRows(found)[0] as
      | {
          thread_id: number
          community_id: number
          author_user_id: number | null
          author_username: string
          created_at: Date
          is_first_post: boolean
          thread_title: string
        }
      | undefined
    if (!post) return false

    /*
     * Same ordering as the direct write — timestamp, then post id as the
     * tie-breaker — so a reply that arrives late with an older timestamp cannot
     * drag a category's last-post column backwards.
     */
    const ancestorNewer = sql`f.last_post_at is null or f.last_post_id is null
      or f.last_post_at < ${post.created_at}
      or (f.last_post_at = ${post.created_at} and f.last_post_id < ${postId})`

    /*
     * Ancestors are the communities whose path is a proper prefix of this community's,
     * terminated by a separator. The trailing dot is not decoration: without it
     * `1.4` matches `1.40`'s path and a sibling subtree inherits the count —
     * the same prefix trap D22 documents for the tree itself.
     */
    await tx.execute(sql`
      update communities f
         set post_count = f.post_count + 1,
             thread_count = f.thread_count + ${post.is_first_post ? 1 : 0},
             last_post_id = case when ${ancestorNewer} then ${postId} else f.last_post_id end,
             last_post_thread_id = case when ${ancestorNewer} then ${post.thread_id} else f.last_post_thread_id end,
             last_post_thread_title = case when ${ancestorNewer} then ${post.thread_title} else f.last_post_thread_title end,
             last_post_user_id = case when ${ancestorNewer} then ${post.author_user_id} else f.last_post_user_id end,
             last_post_username = case when ${ancestorNewer} then ${post.author_username} else f.last_post_username end,
             last_post_at = case when ${ancestorNewer} then ${post.created_at} else f.last_post_at end,
             updated_at = now()
        from communities child
       where child.id = ${post.community_id}
         and f.id <> child.id
         and child.path like f.path || '.%'
    `)

    return true
  })
}

/** Convenience for an operational import; request writers use the function above. */
export class PostgresContentCounterRepository {
  constructor(private readonly db: Database) {}

  async recordCreated(content: CreatedContent): Promise<void> {
    await this.db.transaction((tx) => applyCreatedContentCounters(tx, content))
  }

  /** Applies one `post.created` event to the posting community's ancestors. */
  async rollUpAncestors(postId: number): Promise<boolean> {
    return rollUpAncestorCounters(this.db, postId)
  }

  /** Applies one `post.visibility_changed` event to the same ancestors (F41). */
  async applyVisibilityChange(postId: number): Promise<boolean> {
    return applyAncestorVisibilityChange(this.db, postId)
  }
}
