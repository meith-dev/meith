/**
 * F50 — thread tools over Postgres.
 *
 * Two of the five are flag flips with an audit row. The other two move every
 * counter a thread's posts contribute — and that arithmetic now lives in
 * `thread-counters.ts`, because F52 applies exactly the same transitions to a
 * bulk selection and two copies of it would eventually disagree.
 */
import { sql } from 'drizzle-orm'

import type {
  MoveDestination,
  ThreadToolTarget,
  ThreadToolsRepository,
} from '@forum/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import {
  applyAuthorCounts,
  applyForumChain,
  logModeratorAction as log,
  syncLedger,
  tallyThread,
} from './thread-counters'
import { repairForumLastPostChain } from './visibility-counters'

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
