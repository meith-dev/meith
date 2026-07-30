/**
 * F41 — what a post's visibility change does to every counter that mentions it.
 *
 * F38 wrote the counters a *created* post moves and left this half explicitly
 * to the gate. It is not the same code with a minus sign, for one reason: some
 * of what F38 writes is not a counter at all. `post_count` is a delta and
 * reverses arithmetically; `last_post_id` is a *pointer*, and the reverse of
 * "this post is now the newest" is not "subtract one" — it is "find what the
 * newest is now". So counts are adjusted and pointers are recomputed, and the
 * two need different guarantees.
 *
 * The split between synchronous and asynchronous follows F38's:
 *
 *   - The **direct forum, thread and author counters** and **every last-post
 *     pointer on the path** are written in the caller's transaction, because
 *     the page the actor lands on has to be right and because a board index
 *     linking to a post that no longer exists is worse than a count being late.
 *   - **Ancestor counts** ride the `post.visibility_changed` event, because a
 *     post four levels deep would otherwise make every deletion update four
 *     rows inside the request.
 *
 * Idempotency comes free from a ledger that already exists.
 * `content_counter_rollups` was F38's replay guard; read as **"this post is
 * currently counted in its ancestors"** it answers the delete and restore cases
 * too, with no new table and no sequence number: a redelivered delete finds no
 * ledger row and does nothing, a redelivered restore finds one and does nothing.
 */
import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

interface CounterTransaction {
  execute(query: SQLWrapper): Promise<unknown>
}

export interface VisibilityChange {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
  readonly authorId: number | null
  readonly isFirstPost: boolean
  /** `+1` when the post became visible, `-1` when it stopped being. */
  readonly delta: 1 | -1
}

/**
 * Recompute a thread's last-post pointer from its visible posts.
 *
 * Posts are ordered by id within a thread everywhere else (F31's keyset), so
 * they are here too — a "newest by timestamp" answer could disagree with the
 * page the reader is looking at. An empty result nulls the pointer rather than
 * leaving the deleted post behind, which is the state a thread reaches when its
 * opening post is sent back for approval.
 */
export async function repairThreadLastPost(
  tx: CounterTransaction,
  threadId: number,
): Promise<void> {
  await tx.execute(sql`
    with newest as (
      select id, author_user_id, author_username, created_at
        from posts
       where thread_id = ${threadId} and visibility = 'visible'
       order by id desc
       limit 1
    )
    update threads t
       set last_post_id = (select id from newest),
           last_post_user_id = (select author_user_id from newest),
           last_post_username = (select author_username from newest),
           last_post_at = coalesce((select created_at from newest), t.created_at),
           updated_at = now()
     where t.id = ${threadId}
  `)
}

/**
 * Recompute the last-post pointer of a forum and every ancestor, bottom-up.
 *
 * Forum pointers are subtree-inclusive, so each level is the newest of (its own
 * visible threads) and (its children's already-correct pointers). Walking
 * deepest-first is what makes that induction hold in one pass.
 *
 * Two indexed reads and one update per level, and the tree is at most a handful
 * deep — which is why this runs on *every* visibility change rather than only
 * when the changed post happened to be a pointer. Deciding whether the repair
 * is needed costs about as much as doing it, and getting that decision subtly
 * wrong leaves the board index advertising a deleted post.
 */
export async function repairForumLastPostChain(
  tx: CounterTransaction,
  forumId: number,
): Promise<void> {
  /*
   * Self plus ancestors, deepest first. The `child.path like f.path || '.%'`
   * form with the separator is D22's prefix trap again: without the dot, forum
   * `1.4` would be treated as an ancestor of `1.40`.
   */
  const chain = resultRows(
    await tx.execute(sql`
      select f.id
        from forums f
        join forums child on child.id = ${forumId}
       where f.id = child.id or child.path like f.path || '.%'
       order by f.depth desc
    `),
  ) as Array<{ id: number }>

  for (const forum of chain) {
    await tx.execute(sql`
      with own as (
        select t.last_post_id as post_id, t.last_post_at as at, t.id as thread_id,
               t.title as thread_title, t.last_post_user_id as user_id,
               t.last_post_username as username
          from threads t
         where t.forum_id = ${forum.id}
           and t.visibility = 'visible'
           and t.last_post_id is not null
         order by t.last_post_at desc, t.last_post_id desc
         limit 1
      ),
      kid as (
        select c.last_post_id as post_id, c.last_post_at as at,
               c.last_post_thread_id as thread_id, c.last_post_thread_title as thread_title,
               c.last_post_user_id as user_id, c.last_post_username as username
          from forums c
         where c.parent_id = ${forum.id} and c.last_post_id is not null
         order by c.last_post_at desc, c.last_post_id desc
         limit 1
      ),
      best as (
        select * from (select * from own union all select * from kid) candidates
         order by at desc, post_id desc
         limit 1
      )
      update forums f
         set last_post_id = (select post_id from best),
             last_post_thread_id = (select thread_id from best),
             last_post_thread_title = (select thread_title from best),
             last_post_user_id = (select user_id from best),
             last_post_username = (select username from best),
             last_post_at = (select at from best),
             updated_at = now()
       where f.id = ${forum.id}
    `)
  }
}

/**
 * Apply a visibility change's counters inside the caller's transaction.
 *
 * The post row has already been updated — that update's `where visibility = …`
 * is what decides whether this runs at all, so a double submit reaches neither
 * the counters nor the event.
 */
export async function applyVisibilityChangeCounters(
  tx: CounterTransaction,
  change: VisibilityChange,
): Promise<void> {
  const threadDelta = change.isFirstPost ? change.delta : 0
  const replyDelta = change.isFirstPost ? 0 : change.delta

  await tx.execute(sql`
    update forums
       set post_count = greatest(post_count + ${change.delta}, 0),
           thread_count = greatest(thread_count + ${threadDelta}, 0),
           updated_at = now()
     where id = ${change.forumId}
  `)

  await tx.execute(sql`
    update threads
       set reply_count = greatest(reply_count + ${replyDelta}, 0),
           updated_at = now()
     where id = ${change.threadId}
  `)

  if (change.authorId !== null) {
    await tx.execute(sql`
      update users
         set post_count = greatest(post_count + ${change.delta}, 0),
             thread_count = greatest(thread_count + ${threadDelta}, 0),
             updated_at = now()
       where id = ${change.authorId}
    `)
  }

  // Pointers before ancestors: the forum chain reads the thread rows below.
  await repairThreadLastPost(tx, change.threadId)
  await repairForumLastPostChain(tx, change.forumId)

  await tx.execute(sql`
    insert into outbox (topic, payload)
    values (
      'post.visibility_changed',
      ${JSON.stringify({
        postId: change.postId,
        threadId: change.threadId,
        forumId: change.forumId,
        visible: change.delta === 1,
      })}::jsonb
    )
  `)
}

/**
 * Bring a post's **ancestor** counts into line with its current visibility.
 *
 * Reads the post's visibility now rather than trusting the event's `visible`
 * flag: events are at-least-once and can arrive out of order, and a
 * delete-then-restore pair delivered backwards would otherwise leave the
 * ancestors permanently one out. Combined with the ledger this makes the
 * handler *convergent* — whatever order events arrive in, the last one to run
 * leaves the ledger agreeing with the row.
 *
 * Returns whether this call changed anything.
 */
export async function applyAncestorVisibilityChange(
  db: Database,
  postId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const found = resultRows(
      await tx.execute(sql`
        select visibility, forum_id, is_first_post from posts where id = ${postId}
      `),
    ) as Array<{ visibility: string; forum_id: number; is_first_post: boolean }>

    const post = found[0]
    // Hard-deleted since the event was written. `content_counter_rollups`
    // cascades from `posts`, so the ledger row went with it.
    if (!post) return false

    const shouldCount = post.visibility === 'visible'
    if (shouldCount) {
      const claimed = await tx.execute(sql`
        insert into content_counter_rollups (post_id) values (${postId})
        on conflict (post_id) do nothing
        returning post_id
      `)
      if (resultRows(claimed).length === 0) return false
    } else {
      const released = await tx.execute(sql`
        delete from content_counter_rollups where post_id = ${postId} returning post_id
      `)
      if (resultRows(released).length === 0) return false
    }

    const delta = shouldCount ? 1 : -1
    const threadDelta = post.is_first_post ? delta : 0

    await tx.execute(sql`
      update forums f
         set post_count = greatest(f.post_count + ${delta}, 0),
             thread_count = greatest(f.thread_count + ${threadDelta}, 0),
             updated_at = now()
        from forums child
       where child.id = ${post.forum_id}
         and f.id <> child.id
         and child.path like f.path || '.%'
    `)

    return true
  })
}
