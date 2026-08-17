import { sql } from 'drizzle-orm'

import type {
  InlineModerationRepository,
  InlineTarget,
  InlineTool,
  MoveDestination,
  QueueSelection,
} from '@meith/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { idList } from './sql-lists'
import {
  applyAuthorCounts,
  applyForumChain,
  type CounterTx,
  logModeratorAction,
  syncLedger,
  tallyThread,
} from './thread-counters'
import { PENDING_APPROVAL } from './visibility'
import { applyVisibilityChangeCounters, repairForumLastPostChain } from './visibility-counters'

interface TargetRow {
  kind: 'thread' | 'post'
  id: number
  forum_id: number
  visibility: InlineTarget['visibility']
  thread_visibility: InlineTarget['visibility']
  is_locked: boolean
  is_sticky: boolean
}

export class PostgresInlineModerationRepository implements InlineModerationRepository {
  constructor(private readonly db: Database) {}

  async resolve(
    selection: readonly QueueSelection[],
    forumIds: readonly number[],
  ): Promise<readonly InlineTarget[]> {
    if (forumIds.length === 0) return []
    const threadIds = selection.filter((s) => s.kind === 'thread').map((s) => s.id)
    const postIds = selection.filter((s) => s.kind === 'post').map((s) => s.id)
    if (threadIds.length === 0 && postIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select 'thread'::text as kind, t.id, t.forum_id, t.visibility,
               t.visibility as thread_visibility, t.is_locked, t.is_sticky
          from threads t
         where t.id in ${idList(threadIds)}
           and t.forum_id in ${idList(forumIds)}
        union all
        select 'post'::text, p.id, t.forum_id, p.visibility,
               t.visibility as thread_visibility, false, false
          from posts p
          join threads t on t.id = p.thread_id
         where p.id in ${idList(postIds)}
           and t.forum_id in ${idList(forumIds)}
      `),
    ) as TargetRow[]

    return rows.map((row) => ({
      kind: row.kind,
      id: Number(row.id),
      forumId: Number(row.forum_id),
      visibility: row.visibility,
      threadVisibility: row.thread_visibility,
      isLocked: row.is_locked,
      isSticky: row.is_sticky,
    }))
  }

  async findDestination(forumId: number): Promise<MoveDestination | null> {
    const rows = resultRows(
      await this.db.execute(sql`select id, type, allow_threads from forums where id = ${forumId}`),
    ) as Array<{ id: number; type: MoveDestination['type']; allow_threads: boolean }>
    const row = rows[0]
    return row === undefined
      ? null
      : { id: Number(row.id), type: row.type, allowThreads: row.allow_threads === true }
  }

  async apply(input: {
    readonly tool: InlineTool
    readonly threadIds: readonly number[]
    readonly postIds: readonly number[]
    readonly toForumId?: number | undefined
    readonly actorUserId: number
    readonly at: Date
  }): Promise<number> {
    if (input.threadIds.length === 0 && input.postIds.length === 0) return 0

    return this.db.transaction(async (tx) => {
      let applied = 0
      const touched = await forumsOf(tx, input.threadIds, input.postIds)

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
          if (input.toForumId === undefined) return 0
          for (const threadId of input.threadIds) {
            applied += (await moveThread(tx, threadId, input.toForumId, input.at)) ? 1 : 0
          }
          break
        }
      }

      if (applied > 0) {
        await logModeratorAction(
          tx,
          `inline.${input.tool}`,
          input.actorUserId,
          {
            threadIds: input.threadIds,
            postIds: input.postIds,
            applied,
            ...forumKeys([...touched], input.toForumId),
          },
          input.at,
        )
      }

      return applied
    })
  }
}

async function forumsOf(
  tx: CounterTx,
  threadIds: readonly number[],
  postIds: readonly number[],
): Promise<ReadonlySet<number>> {
  const rows = resultRows(
    await tx.execute(sql`
      select forum_id from threads where id in ${idList(threadIds)}
      union
      select forum_id from posts where id in ${idList(postIds)}
    `),
  ) as Array<{ forum_id: number }>
  return new Set(rows.map((row) => Number(row.forum_id)))
}

function forumKeys(
  source: readonly number[],
  toForumId: number | undefined,
): Record<string, unknown> {
  if (toForumId === undefined) {
    return source.length === 1 ? { forumId: source[0], forumIds: source } : { forumIds: source }
  }
  const forumIds = [...new Set([...source, toForumId])]
  return source.length === 1
    ? { fromForumId: source[0], toForumId, forumIds }
    : { toForumId, forumIds }
}

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

async function approveThread(tx: CounterTx, threadId: number): Promise<boolean> {
  const moved = resultRows(
    await tx.execute(sql`
      update threads set visibility = 'visible', updated_at = now()
       where id = ${threadId} and visibility = ${PENDING_APPROVAL}
       returning id, forum_id, first_post_id, author_user_id
    `),
  ) as Array<{
    id: number
    forum_id: number
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
        forumId: Number(thread.forum_id),
        authorId: thread.author_user_id === null ? null : Number(thread.author_user_id),
        isFirstPost: true,
        delta: 1,
      })
    }
  }
  return true
}

async function movePost(tx: CounterTx, postId: number, from: string, to: string): Promise<boolean> {
  const moved = resultRows(
    await tx.execute(sql`
      update posts set visibility = ${to}
       where id = ${postId} and visibility = ${from}
       returning id, thread_id, forum_id, author_user_id, is_first_post
    `),
  ) as Array<{
    id: number
    thread_id: number
    forum_id: number
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
      forumId: Number(post.forum_id),
      authorId: post.author_user_id === null ? null : Number(post.author_user_id),
      isFirstPost: post.is_first_post,
      delta: delta as 1 | -1,
    })
  }
  return true
}

async function setThreadVisibility(
  tx: CounterTx,
  threadId: number,
  from: 'visible' | 'deleted',
  to: 'visible' | 'deleted',
  at: Date,
): Promise<boolean> {
  const tally = await tallyThread(tx, threadId)

  const moved = resultRows(
    await tx.execute(sql`
      update threads set visibility = ${to}, updated_at = ${at}
       where id = ${threadId} and visibility = ${from}
       returning forum_id
    `),
  ) as Array<{ forum_id: number }>
  const row = moved[0]
  if (!row) return false

  const forumId = Number(row.forum_id)
  const delta: 1 | -1 = to === 'visible' ? 1 : -1

  await applyForumChain(tx, forumId, delta, tally)
  await applyAuthorCounts(tx, delta, tally)
  await syncLedger(tx, threadId, to === 'visible')
  await repairForumLastPostChain(tx, forumId)
  return true
}

async function moveThread(
  tx: CounterTx,
  threadId: number,
  toForumId: number,
  at: Date,
): Promise<boolean> {
  const current = resultRows(
    await tx.execute(sql`select forum_id, visibility from threads where id = ${threadId}`),
  ) as Array<{ forum_id: number; visibility: string }>
  const before = current[0]
  if (before?.visibility !== 'visible') return false

  const fromForumId = Number(before.forum_id)
  if (fromForumId === toForumId) return false

  const tally = await tallyThread(tx, threadId)

  const moved = resultRows(
    await tx.execute(sql`
      update threads set forum_id = ${toForumId}, updated_at = ${at}
       where id = ${threadId} and forum_id = ${fromForumId}
       returning id
    `),
  ) as Array<{ id: number }>
  if (moved.length === 0) return false

  await tx.execute(sql`
    update posts set forum_id = ${toForumId} where thread_id = ${threadId}
  `)

  await applyForumChain(tx, fromForumId, -1, tally)
  await applyForumChain(tx, toForumId, 1, tally)
  await repairForumLastPostChain(tx, fromForumId)
  await repairForumLastPostChain(tx, toForumId)
  return true
}
