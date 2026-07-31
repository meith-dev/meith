/**
 * F50 — thread tools over Postgres.
 *
 * Two of the five are flag flips with an audit row. The other two move every
 * counter a thread's posts contribute, and that is what this file is really
 * about.
 *
 * **Why the ancestors are updated synchronously here**, unlike F38's roll-up
 * and F41's reversal. Those are per-post deltas, and the
 * `content_counter_rollups` ledger — "this post is currently counted in its
 * ancestors" — makes them idempotent under at-least-once delivery. A *move*
 * cannot use that ledger: the post is still counted, just somewhere else, and a
 * row that says "counted" cannot express which chain it is counted in. Rather
 * than have one operation follow a different rule from its neighbour, both
 * thread-level operations do their ancestors in the caller's transaction. They
 * are bounded by tree depth and they are rare — a board moves a thread far less
 * often than it gains a reply.
 */
import { sql } from 'drizzle-orm'

import type {
  MoveDestination,
  ThreadToolTarget,
  ThreadToolsRepository,
} from '@forum/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { repairForumLastPostChain } from './visibility-counters'

interface CounterTx {
  execute(query: ReturnType<typeof sql>): Promise<unknown>
}

/**
 * What a thread contributes to the board's totals.
 *
 * Counted once and reused for the forum, the ancestors and every author,
 * because they must agree: three separate counts of the same thing is how a
 * move leaves a forum and its category disagreeing by one.
 */
interface ThreadTally {
  readonly posts: number
  readonly byAuthor: ReadonlyArray<{ userId: number; posts: number }>
  readonly threadAuthorId: number | null
}

async function tallyThread(tx: CounterTx, threadId: number): Promise<ThreadTally> {
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
 * Apply a thread's contribution to a forum **and every ancestor**, in one
 * statement.
 *
 * `f.id = child.id or child.path like f.path || '.%'` is self-plus-ancestors:
 * the separator is D22's prefix trap again, without which `1.4` would be
 * treated as an ancestor of `1.40`.
 */
async function applyForumChain(
  tx: CounterTx,
  forumId: number,
  delta: 1 | -1,
  tally: ThreadTally,
): Promise<void> {
  await tx.execute(sql`
    update forums f
       set post_count = greatest(f.post_count + ${delta * tally.posts}, 0),
           thread_count = greatest(f.thread_count + ${delta}, 0),
           updated_at = now()
      from forums child
     where child.id = ${forumId}
       and (f.id = child.id or child.path like f.path || '.%')
  `)
}

/** The same contribution, per author. A move leaves these alone. */
async function applyAuthorCounts(
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
async function syncLedger(
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

async function log(
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

export class PostgresThreadToolsRepository implements ThreadToolsRepository {
  constructor(private readonly db: Database) {}

  async find(threadId: number): Promise<ThreadToolTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, forum_id, slug, title, is_locked, is_sticky, visibility
          from threads where id = ${threadId}
      `),
    ) as Array<{
      id: number
      forum_id: number
      slug: string
      title: string
      is_locked: boolean
      is_sticky: boolean
      visibility: ThreadToolTarget['visibility']
    }>

    const row = rows[0]
    if (!row) return null
    return {
      id: Number(row.id),
      forumId: Number(row.forum_id),
      slug: row.slug,
      title: row.title,
      isLocked: row.is_locked,
      isSticky: row.is_sticky,
      visibility: row.visibility,
    }
  }

  async findDestination(forumId: number): Promise<MoveDestination | null> {
    const rows = resultRows(
      await this.db.execute(sql`select id, type from forums where id = ${forumId}`),
    ) as Array<{ id: number; type: MoveDestination['type'] }>
    const row = rows[0]
    return row === undefined ? null : { id: Number(row.id), type: row.type }
  }

  async setLocked(input: {
    readonly threadId: number
    readonly locked: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.flag('is_locked', input.locked, input, 'thread.lock')
  }

  async setSticky(input: {
    readonly threadId: number
    readonly sticky: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.flag('is_sticky', input.sticky, input, 'thread.stick')
  }

  /**
   * One flag, one audit row, and `<>` in the WHERE.
   *
   * The inequality is what makes a double submit report `false` instead of
   * writing a second audit row saying a moderator locked an already-locked
   * thread — a log that records acts that did not happen is worse than none.
   */
  private async flag(
    column: 'is_locked' | 'is_sticky',
    value: boolean,
    input: { readonly threadId: number; readonly actorUserId: number; readonly at: Date },
    action: string,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const moved = resultRows(
        await tx.execute(
          column === 'is_locked'
            ? sql`update threads set is_locked = ${value}, updated_at = ${input.at}
                   where id = ${input.threadId} and is_locked <> ${value} returning id`
            : sql`update threads set is_sticky = ${value}, updated_at = ${input.at}
                   where id = ${input.threadId} and is_sticky <> ${value} returning id`,
        ),
      ) as Array<{ id: number }>
      if (moved.length === 0) return false

      await log(tx, action, input.actorUserId, { threadId: input.threadId, value }, input.at)
      return true
    })
  }

  async setVisibility(input: {
    readonly threadId: number
    readonly from: 'visible' | 'deleted'
    readonly to: 'visible' | 'deleted'
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      /*
       * The tally is taken *before* the flip and reused after it. Its subject is
       * the posts, whose own `visibility` never changes here — a post in a
       * deleted thread keeps its state, because restoring the thread must put
       * back exactly what was there and not approve anything on the way.
       */
      const tally = await tallyThread(tx, input.threadId)

      const moved = resultRows(
        await tx.execute(sql`
          update threads set visibility = ${input.to}, updated_at = ${input.at}
           where id = ${input.threadId} and visibility = ${input.from}
           returning forum_id
        `),
      ) as Array<{ forum_id: number }>
      const row = moved[0]
      if (!row) return false

      const forumId = Number(row.forum_id)
      const delta: 1 | -1 = input.to === 'visible' ? 1 : -1

      await applyForumChain(tx, forumId, delta, tally)
      await applyAuthorCounts(tx, delta, tally)
      await syncLedger(tx, input.threadId, input.to === 'visible')
      await repairForumLastPostChain(tx, forumId)

      await log(
        tx,
        input.to === 'visible' ? 'thread.restore' : 'thread.delete',
        input.actorUserId,
        { threadId: input.threadId, forumId, posts: tally.posts },
        input.at,
      )
      return true
    })
  }

  async move(input: {
    readonly threadId: number
    readonly fromForumId: number
    readonly toForumId: number
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const tally = await tallyThread(tx, input.threadId)

      const moved = resultRows(
        await tx.execute(sql`
          update threads set forum_id = ${input.toForumId}, updated_at = ${input.at}
           where id = ${input.threadId} and forum_id = ${input.fromForumId}
           returning id
        `),
      ) as Array<{ id: number }>
      if (moved.length === 0) return false

      /*
       * `posts.forum_id` is denormalised from the thread (R3.3) so that
       * permission filtering and the moderation queue can scope by forum
       * without joining `threads`. A move that updated only the thread would
       * leave every post claiming to be somewhere it is not — and the queue,
       * the leak suite's scope and the recount all read that column.
       */
      await tx.execute(sql`
        update posts set forum_id = ${input.toForumId} where thread_id = ${input.threadId}
      `)

      /*
       * Both chains, in this order. Where they share an ancestor the two
       * statements cancel to zero, which is exactly right: a thread moved
       * between two subforums of one category has not left the category.
       *
       * Author counts are deliberately untouched. A move changes where somebody
       * wrote, never how much.
       */
      await applyForumChain(tx, input.fromForumId, -1, tally)
      await applyForumChain(tx, input.toForumId, 1, tally)

      await repairForumLastPostChain(tx, input.fromForumId)
      await repairForumLastPostChain(tx, input.toForumId)

      await log(
        tx,
        'thread.move',
        input.actorUserId,
        {
          threadId: input.threadId,
          from: input.fromForumId,
          to: input.toForumId,
          posts: tally.posts,
        },
        input.at,
      )
      return true
    })
  }
}
