/**
 * F52 — inline moderation over Postgres.
 *
 * Every transition in this file already existed. Approving is F48's, which is
 * F41's; deleting and restoring a post is F41's; deleting, restoring, locking,
 * pinning and moving a thread is F50's. What is new is doing a *chunk* of them
 * in one transaction, and the two rules that come with that:
 *
 *   - **`resolve` is scoped.** It takes the communities the actor may use this tool
 *     in and never looks outside them, so an id from anywhere else is absent
 *     rather than forbidden. Without that the outcome counts are a
 *     content-existence oracle over the whole board.
 *   - **Every write is state-guarded.** `where visibility = 'visible'`,
 *     `where is_locked <> true`. That is what makes the count returned here
 *     mean "rows that actually moved" rather than "rows I was asked about", and
 *     it is what makes a chunk that never ran safe to re-submit.
 */
import { sql, type SQL } from 'drizzle-orm'

import type {
  InlineModerationRepository,
  InlineTarget,
  InlineTool,
  MoveDestination,
  QueueSelection,
} from '@meith/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import {
  applyAuthorCounts,
  applyCommunityChain,
  logModeratorAction,
  syncLedger,
  tallyThread,
  type CounterTx,
} from './thread-counters'
import { PENDING_APPROVAL } from './visibility'
import {
  applyVisibilityChangeCounters,
  repairCommunityLastPostChain,
} from './visibility-counters'

/**
 * An `in (…)` list from a set of ids.
 *
 * Not `= any($1::int[])`: drizzle expands a JavaScript array in a template into
 * a comma-separated *placeholder list*, so `any(${ids})` compiles to
 * `any(($1, $2))` — a syntax error. `in (null)` is the correct reading of an
 * empty set: never true. (Same note as the queue's; the trap is the same one.)
 */
function idList(ids: readonly number[]): SQL {
  if (ids.length === 0) return sql`(null)`
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`
}

interface TargetRow {
  kind: 'thread' | 'post'
  id: number
  community_id: number
  visibility: InlineTarget['visibility']
  thread_visibility: InlineTarget['visibility']
  is_locked: boolean
  is_sticky: boolean
}

export class PostgresInlineModerationRepository implements InlineModerationRepository {
  constructor(private readonly db: Database) {}

  async resolve(
    selection: readonly QueueSelection[],
    communityIds: readonly number[],
  ): Promise<readonly InlineTarget[]> {
    if (communityIds.length === 0) return []
    const threadIds = selection.filter((s) => s.kind === 'thread').map((s) => s.id)
    const postIds = selection.filter((s) => s.kind === 'post').map((s) => s.id)
    if (threadIds.length === 0 && postIds.length === 0) return []

    /*
     * `t.community_id in (…)` on both halves is the scope, and it is on the *thread*
     * for a post too — `posts.community_id` is denormalised (R3.3) and a move keeps
     * the two in step, but the thread is the authority on where a post lives and
     * the join is already there.
     */
    const rows = resultRows(
      await this.db.execute(sql`
        select 'thread'::text as kind, t.id, t.community_id, t.visibility,
               t.visibility as thread_visibility, t.is_locked, t.is_sticky
          from threads t
         where t.id in ${idList(threadIds)}
           and t.community_id in ${idList(communityIds)}
        union all
        select 'post'::text, p.id, t.community_id, p.visibility,
               t.visibility as thread_visibility, false, false
          from posts p
          join threads t on t.id = p.thread_id
         where p.id in ${idList(postIds)}
           and t.community_id in ${idList(communityIds)}
      `),
    ) as TargetRow[]

    return rows.map((row) => ({
      kind: row.kind,
      id: Number(row.id),
      communityId: Number(row.community_id),
      visibility: row.visibility,
      threadVisibility: row.thread_visibility,
      isLocked: row.is_locked,
      isSticky: row.is_sticky,
    }))
  }

  async findDestination(communityId: number): Promise<MoveDestination | null> {
    const rows = resultRows(
      await this.db.execute(sql`select id, type from communities where id = ${communityId}`),
    ) as Array<{ id: number; type: MoveDestination['type'] }>
    const row = rows[0]
    return row === undefined ? null : { id: Number(row.id), type: row.type }
  }

  async apply(input: {
    readonly tool: InlineTool
    readonly threadIds: readonly number[]
    readonly postIds: readonly number[]
    readonly toCommunityId?: number | undefined
    readonly actorUserId: number
    readonly at: Date
  }): Promise<number> {
    if (input.threadIds.length === 0 && input.postIds.length === 0) return 0

    return this.db.transaction(async (tx) => {
      let applied = 0

      switch (input.tool) {
        case 'lock':
        case 'unlock':
        case 'stick':
        case 'unstick':
          applied = await flagThreads(tx, input.tool, input.threadIds, input.at)
          break

        case 'approve':
          for (const threadId of input.threadIds) {
            applied += (await approveThread(tx, threadId)) ? 1 : 0
          }
          for (const postId of input.postIds) {
            applied += (await movePost(tx, postId, PENDING_APPROVAL, 'visible')) ? 1 : 0
          }
          break

        case 'delete':
        case 'restore': {
          const from = input.tool === 'delete' ? 'visible' : 'deleted'
          const to = input.tool === 'delete' ? 'deleted' : 'visible'
          for (const threadId of input.threadIds) {
            applied += (await setThreadVisibility(tx, threadId, from, to, input.at)) ? 1 : 0
          }
          for (const postId of input.postIds) {
            applied += (await movePost(tx, postId, from, to)) ? 1 : 0
          }
          break
        }

        case 'move': {
          if (input.toCommunityId === undefined) return 0
          for (const threadId of input.threadIds) {
            applied += (await moveThread(tx, threadId, input.toCommunityId, input.at)) ? 1 : 0
          }
          break
        }
      }

      /*
       * One audit row per chunk, not per row — F48's rule. A moderator clearing
       * a spam run performed one act, and forty rows saying so would bury the
       * next one. The ids are in the detail, so the act is still reconstructable.
       */
      if (applied > 0) {
        await logModeratorAction(
          tx,
          `inline.${input.tool}`,
          input.actorUserId,
          {
            threadIds: input.threadIds,
            postIds: input.postIds,
            ...(input.toCommunityId === undefined ? {} : { toCommunityId: input.toCommunityId }),
            applied,
          },
          input.at,
        )
      }

      return applied
    })
  }
}

/**
 * Lock, unlock, pin or unpin, in one statement for the whole chunk.
 *
 * The `<>` in the WHERE is F50's: it is what makes a double submit report zero
 * instead of writing an audit row claiming a moderator locked an already-locked
 * thread. Unlike the visibility tools these move no counters at all, so there is
 * nothing to do per row and the set update is the honest shape.
 */
async function flagThreads(
  tx: CounterTx,
  tool: 'lock' | 'unlock' | 'stick' | 'unstick',
  threadIds: readonly number[],
  at: Date,
): Promise<number> {
  if (threadIds.length === 0) return 0
  const locking = tool === 'lock' || tool === 'unlock'
  const value = tool === 'lock' || tool === 'stick'

  const moved = resultRows(
    await tx.execute(
      locking
        ? sql`update threads set is_locked = ${value}, updated_at = ${at}
               where id in ${idList(threadIds)} and visibility = 'visible'
                 and is_locked <> ${value} returning id`
        : sql`update threads set is_sticky = ${value}, updated_at = ${at}
               where id in ${idList(threadIds)} and visibility = 'visible'
                 and is_sticky <> ${value} returning id`,
    ),
  ) as Array<{ id: number }>
  return moved.length
}

/**
 * Approve one held thread and the opening post it was held with (F48).
 *
 * The two move together because F39 wrote them together: approving the thread
 * without its first post produces a visible thread with nothing to read.
 * Nothing else in the thread moves — a reply held separately is its own row in
 * the selection.
 */
async function approveThread(tx: CounterTx, threadId: number): Promise<boolean> {
  const moved = resultRows(
    await tx.execute(sql`
      update threads set visibility = 'visible', updated_at = now()
       where id = ${threadId} and visibility = ${PENDING_APPROVAL}
       returning id, community_id, first_post_id, author_user_id
    `),
  ) as Array<{
    id: number
    community_id: number
    first_post_id: number | null
    author_user_id: number | null
  }>
  const thread = moved[0]
  if (!thread) return false

  if (thread.first_post_id !== null) {
    const post = resultRows(
      await tx.execute(sql`
        update posts set visibility = 'visible'
         where id = ${thread.first_post_id} and visibility = ${PENDING_APPROVAL}
         returning id
      `),
    ) as Array<{ id: number }>

    if (post[0]) {
      await applyVisibilityChangeCounters(tx, {
        postId: Number(post[0].id),
        threadId: Number(thread.id),
        communityId: Number(thread.community_id),
        authorId: thread.author_user_id === null ? null : Number(thread.author_user_id),
        isFirstPost: true,
        delta: 1,
      })
    }
  }
  return true
}

/**
 * One post between two states, with F41's counter rule intact.
 *
 * `unapproved → deleted` never happens here (rejection is the queue's), but the
 * delta arithmetic is written the same way regardless, because it is the rule
 * that keeps a "deleting always decrements" mistake out of the file: the only
 * state that counts is `visible`.
 */
async function movePost(
  tx: CounterTx,
  postId: number,
  from: string,
  to: string,
): Promise<boolean> {
  const moved = resultRows(
    await tx.execute(sql`
      update posts set visibility = ${to}
       where id = ${postId} and visibility = ${from}
       returning id, thread_id, community_id, author_user_id, is_first_post
    `),
  ) as Array<{
    id: number
    thread_id: number
    community_id: number
    author_user_id: number | null
    is_first_post: boolean
  }>
  const post = moved[0]
  if (!post) return false

  const delta = (to === 'visible' ? 1 : 0) - (from === 'visible' ? 1 : 0)
  if (delta !== 0) {
    await applyVisibilityChangeCounters(tx, {
      postId: Number(post.id),
      threadId: Number(post.thread_id),
      communityId: Number(post.community_id),
      authorId: post.author_user_id === null ? null : Number(post.author_user_id),
      isFirstPost: post.is_first_post,
      delta: delta as 1 | -1,
    })
  }
  return true
}

/** F50's thread delete/restore, unchanged and reused rather than reimplemented. */
async function setThreadVisibility(
  tx: CounterTx,
  threadId: number,
  from: 'visible' | 'deleted',
  to: 'visible' | 'deleted',
  at: Date,
): Promise<boolean> {
  /*
   * The tally is taken *before* the flip and reused after it. Its subject is
   * the posts, whose own `visibility` never changes — a post in a deleted
   * thread keeps its state, so restoring puts back exactly what was there and
   * approves nothing on the way.
   */
  const tally = await tallyThread(tx, threadId)

  const moved = resultRows(
    await tx.execute(sql`
      update threads set visibility = ${to}, updated_at = ${at}
       where id = ${threadId} and visibility = ${from}
       returning community_id
    `),
  ) as Array<{ community_id: number }>
  const row = moved[0]
  if (!row) return false

  const communityId = Number(row.community_id)
  const delta: 1 | -1 = to === 'visible' ? 1 : -1

  await applyCommunityChain(tx, communityId, delta, tally)
  await applyAuthorCounts(tx, delta, tally)
  await syncLedger(tx, threadId, to === 'visible')
  await repairCommunityLastPostChain(tx, communityId)
  return true
}

/** F50's move, likewise. Both chains, and `posts.community_id` kept in step. */
async function moveThread(
  tx: CounterTx,
  threadId: number,
  toCommunityId: number,
  at: Date,
): Promise<boolean> {
  /*
   * Where it is *now*, read before the write rather than returned by it. Both
   * community chains have to be adjusted and one of them is the one being left, so
   * the update cannot be the thing that tells us — and `from_community_id` is then
   * the guard on the update itself, which is what makes a double submit move no
   * counters.
   */
  const current = resultRows(
    await tx.execute(sql`select community_id, visibility from threads where id = ${threadId}`),
  ) as Array<{ community_id: number; visibility: string }>
  const before = current[0]
  if (!before || before.visibility !== 'visible') return false

  const fromCommunityId = Number(before.community_id)
  if (fromCommunityId === toCommunityId) return false

  const tally = await tallyThread(tx, threadId)

  const moved = resultRows(
    await tx.execute(sql`
      update threads set community_id = ${toCommunityId}, updated_at = ${at}
       where id = ${threadId} and community_id = ${fromCommunityId}
       returning id
    `),
  ) as Array<{ id: number }>
  if (moved.length === 0) return false

  await tx.execute(sql`
    update posts set community_id = ${toCommunityId} where thread_id = ${threadId}
  `)

  /*
   * Both chains, in this order. Where they share an ancestor the two statements
   * cancel to zero, which is exactly right: a thread moved between two
   * subcommunities of one category has not left the category. Author counts are
   * deliberately untouched — a move changes where somebody wrote, never how
   * much (F51 settled that).
   */
  await applyCommunityChain(tx, fromCommunityId, -1, tally)
  await applyCommunityChain(tx, toCommunityId, 1, tally)
  await repairCommunityLastPostChain(tx, fromCommunityId)
  await repairCommunityLastPostChain(tx, toCommunityId)
  return true
}
