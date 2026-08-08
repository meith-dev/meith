/**
 * What a *thread* contributes to the board's totals, and how to move it.
 *
 * Extracted from F50's thread-tools repository when F52 needed the same
 * arithmetic for a bulk selection. It is deliberately one module rather than
 * two copies: the counters a thread moves are the same counters whether one
 * moderator pressed "Delete thread" on its page or ticked forty boxes on the
 * listing, and the way that goes wrong is by drifting apart — a fix applied to
 * one path and not the other, discovered a month later as a category whose
 * total disagrees with its communities by seven.
 *
 * The reason ancestors are updated *synchronously* here, unlike F38's roll-up
 * and F41's reversal, is unchanged and worth repeating: those are per-post
 * deltas made idempotent by the `content_counter_rollups` ledger, and a *move*
 * cannot use that ledger, because the post is still counted — just somewhere
 * else — and a row that says "counted" cannot say which chain it is counted in.
 */
import { sql } from 'drizzle-orm'

import { resultRows } from './result-rows'

export interface CounterTx {
  execute(query: ReturnType<typeof sql>): Promise<unknown>
}

/**
 * What a thread contributes to the board's totals.
 *
 * Counted once and reused for the community, the ancestors and every author,
 * because they must agree: three separate counts of the same thing is how a
 * move leaves a community and its category disagreeing by one.
 */
export interface ThreadTally {
  readonly posts: number
  readonly byAuthor: ReadonlyArray<{ userId: number; posts: number }>
  readonly threadAuthorId: number | null
}

export async function tallyThread(
  tx: CounterTx,
  threadId: number,
): Promise<ThreadTally> {
  const rows = resultRows(
    await tx.execute(sql`
      select p.author_user_id, count(*)::int as n
        from posts p
       where p.thread_id = ${threadId} and p.visibility = 'visible'
       group by p.author_user_id
    `),
  ) as Array<{ author_user_id: number | null; n: number }>

  const owner = resultRows(
    await tx.execute(sql`select author_user_id from threads where id = ${threadId}`),
  ) as Array<{ author_user_id: number | null }>

  return {
    posts: rows.reduce((total, row) => total + Number(row.n), 0),
    byAuthor: rows.flatMap((row) =>
      row.author_user_id === null
        ? []
        : [{ userId: Number(row.author_user_id), posts: Number(row.n) }],
    ),
    threadAuthorId:
      owner[0]?.author_user_id == null ? null : Number(owner[0].author_user_id),
  }
}

/**
 * Apply a thread's contribution to a community **and every ancestor**, in one
 * statement.
 *
 * `f.id = child.id or child.path like f.path || '.%'` is self-plus-ancestors:
 * the separator is D22's prefix trap again, without which `1.4` would be
 * treated as an ancestor of `1.40`.
 */
export async function applyCommunityChain(
  tx: CounterTx,
  communityId: number,
  delta: 1 | -1,
  tally: ThreadTally,
): Promise<void> {
  await tx.execute(sql`
    update communities f
       set post_count = greatest(f.post_count + ${delta * tally.posts}, 0),
           thread_count = greatest(f.thread_count + ${delta}, 0),
           updated_at = now()
      from communities child
     where child.id = ${communityId}
       and (f.id = child.id or child.path like f.path || '.%')
  `)
}

/** The same contribution, per author. A move leaves these alone. */
export async function applyAuthorCounts(
  tx: CounterTx,
  delta: 1 | -1,
  tally: ThreadTally,
): Promise<void> {
  for (const author of tally.byAuthor) {
    await tx.execute(sql`
      update users
         set post_count = greatest(post_count + ${delta * author.posts}, 0),
             updated_at = now()
       where id = ${author.userId}
    `)
  }
  if (tally.threadAuthorId !== null) {
    await tx.execute(sql`
      update users
         set thread_count = greatest(thread_count + ${delta}, 0), updated_at = now()
       where id = ${tally.threadAuthorId}
    `)
  }
}

/**
 * Keep the roll-up ledger agreeing with reality.
 *
 * The ledger means "this post is currently counted in its ancestors". A thread
 * leaving the board takes its posts' rows with it, and a thread coming back
 * puts them there — otherwise a post deleted individually afterwards would
 * decrement ancestors that had already been decremented by the thread.
 */
export async function syncLedger(
  tx: CounterTx,
  threadId: number,
  counted: boolean,
): Promise<void> {
  if (counted) {
    await tx.execute(sql`
      insert into content_counter_rollups (post_id)
      select p.id from posts p
       where p.thread_id = ${threadId} and p.visibility = 'visible'
      on conflict (post_id) do nothing
    `)
    return
  }
  await tx.execute(sql`
    delete from content_counter_rollups r
     using posts p
     where r.post_id = p.id and p.thread_id = ${threadId}
  `)
}

/** One audit row. Every moderator act on this board leaves one. */
export async function logModeratorAction(
  tx: CounterTx,
  action: string,
  actorUserId: number,
  detail: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await tx.execute(sql`
    insert into admin_log (user_id, action, detail, created_at)
    values (${actorUserId}, ${action}, ${JSON.stringify(detail)}::jsonb, ${at})
  `)
}
