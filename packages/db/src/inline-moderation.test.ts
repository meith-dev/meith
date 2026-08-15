import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresInlineModerationRepository } from './inline-moderation'
import { PostgresThreadWriteRepository } from './thread-writes'
import { rollUpAncestorCounters } from './content-counters'
import { resultRows } from './result-rows'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresInlineModerationRepository
let writes: PostgresThreadWriteRepository

const CATEGORY = 1
const LEFT = 4
const RIGHT = 5
const OTHER = 7

const ADA = 1
const BOB = 2
const MOD = 3
const AT = new Date('2026-07-31T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresInlineModerationRepository(db)
  writes = new PostgresThreadWriteRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from admin_log`)
  await db.execute(sql`delete from content_counter_rollups`)
  await db.execute(sql`delete from outbox`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values(
    [
      [ADA, 'ada'],
      [BOB, 'bob'],
      [MOD, 'mod'],
    ].map(([id, name]) => ({
      id: id as number,
      username: name as string,
      usernameLower: name as string,
      email: `${String(name)}@example.test`,
      emailLower: `${String(name)}@example.test`,
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: 2,
    })),
  )
  await db.insert(forums).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: LEFT, title: 'Left', slug: 'left', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: RIGHT, title: 'Right', slug: 'right', path: '1.5', depth: 1, parentId: CATEGORY },
    { id: OTHER, type: 'category', title: 'Elsewhere', slug: 'elsewhere', path: '7', depth: 0 },
  ])
})

async function seedThread(
  options: {
    forumId?: number
    title?: string
    visibility?: 'visible' | 'unapproved'
    replies?: boolean
  } = {},
): Promise<{ threadId: number; postIds: number[] }> {
  const forumId = options.forumId ?? LEFT
  const title = options.title ?? 'Hello there'
  const visibility = options.visibility ?? 'visible'

  const thread = await writes.create({
    forumId,
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    message: 'the opening post',
    prefixId: null,
    authorUserId: ADA,
    authorUsername: 'ada',
    visibility,
    subscribe: false,
    createdAt: AT,
  })
  const postIds = [thread.postId]

  if (options.replies !== false) {
    const { postId } = await writes.createReply({
      threadId: thread.threadId,
      forumId,
      threadTitle: title,
      message: 'a reply',
      authorUserId: BOB,
      authorUsername: 'bob',
      visibility,
      subscribe: false,
      createdAt: new Date(AT.getTime() + 60_000),
    })
    postIds.push(postId)
  }

  if (visibility === 'visible') {
    for (const id of postIds) await rollUpAncestorCounters(db, id)
  }
  return { threadId: thread.threadId, postIds }
}

async function forumCounts(id: number): Promise<{ posts: number; threads: number }> {
  const rows = resultRows(
    await db.execute(sql`select post_count, thread_count from forums where id = ${id}`),
  ) as Array<{ post_count: number; thread_count: number }>
  return { posts: Number(rows[0]!.post_count), threads: Number(rows[0]!.thread_count) }
}

async function userCounts(id: number): Promise<{ posts: number; threads: number }> {
  const rows = resultRows(
    await db.execute(sql`select post_count, thread_count from users where id = ${id}`),
  ) as Array<{ post_count: number; thread_count: number }>
  return { posts: Number(rows[0]!.post_count), threads: Number(rows[0]!.thread_count) }
}

async function auditActions(): Promise<string[]> {
  const rows = resultRows(
    await db.execute(sql`select action from admin_log order by id`),
  ) as Array<{ action: string }>
  return rows.map((row) => row.action)
}

async function threadVisibility(id: number): Promise<string> {
  const rows = resultRows(
    await db.execute(sql`select visibility from threads where id = ${id}`),
  ) as Array<{ visibility: string }>
  return rows[0]!.visibility
}

async function postVisibility(id: number): Promise<string> {
  const rows = resultRows(
    await db.execute(sql`select visibility from posts where id = ${id}`),
  ) as Array<{ visibility: string }>
  return rows[0]!.visibility
}

describe('resolve', () => {
  it('returns the forum a row is really in, not the one the form claimed', async () => {
    const left = await seedThread({ forumId: LEFT, title: 'Left thread' })
    const right = await seedThread({ forumId: RIGHT, title: 'Right thread' })

    const found = await repo.resolve(
      [
        { kind: 'thread', id: left.threadId },
        { kind: 'thread', id: right.threadId },
      ],
      [LEFT, RIGHT],
    )

    expect(found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: left.threadId, forumId: LEFT }),
        expect.objectContaining({ id: right.threadId, forumId: RIGHT }),
      ]),
    )
  })

  it('omits a row outside the scope entirely', async () => {
    const left = await seedThread({ forumId: LEFT, title: 'Left thread' })
    const right = await seedThread({ forumId: RIGHT, title: 'Right thread' })

    const found = await repo.resolve(
      [
        { kind: 'thread', id: left.threadId },
        { kind: 'thread', id: right.threadId },
      ],
      [LEFT],
    )

    expect(found.map((row) => row.id)).toEqual([left.threadId])
  })

  it('scopes a post by its thread and reports the thread it lives in', async () => {
    const { threadId, postIds } = await seedThread({ visibility: 'unapproved' })

    const inScope = await repo.resolve([{ kind: 'post', id: postIds[1]! }], [LEFT])
    expect(inScope[0]).toMatchObject({
      kind: 'post',
      forumId: LEFT,
      visibility: 'unapproved',
      threadVisibility: 'unapproved',
    })
    expect(threadId).toBeGreaterThan(0)

    expect(await repo.resolve([{ kind: 'post', id: postIds[1]! }], [RIGHT])).toEqual([])
  })

  it('returns nothing at all for an empty scope', async () => {
    const { threadId } = await seedThread()
    expect(await repo.resolve([{ kind: 'thread', id: threadId }], [])).toEqual([])
  })
})

describe('bulk delete and restore', () => {
  it('moves every counter for every thread in the chunk, ancestors included', async () => {
    const first = await seedThread({ title: 'First' })
    const second = await seedThread({ title: 'Second' })

    expect(await forumCounts(LEFT)).toEqual({ posts: 4, threads: 2 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 4, threads: 2 })
    expect(await userCounts(ADA)).toEqual({ posts: 2, threads: 2 })
    expect(await userCounts(BOB)).toEqual({ posts: 2, threads: 0 })

    const applied = await repo.apply({
      tool: 'delete',
      threadIds: [first.threadId, second.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(2)
    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 0, threads: 0 })
    expect(await userCounts(ADA)).toEqual({ posts: 0, threads: 0 })
    expect(await userCounts(BOB)).toEqual({ posts: 0, threads: 0 })
    expect(await auditActions()).toEqual(['inline.delete'])
  })

  it('puts exactly the same numbers back on restore', async () => {
    const first = await seedThread({ title: 'First' })
    const second = await seedThread({ title: 'Second' })
    const before = {
      left: await forumCounts(LEFT),
      category: await forumCounts(CATEGORY),
      ada: await userCounts(ADA),
      bob: await userCounts(BOB),
    }

    await repo.apply({
      tool: 'delete',
      threadIds: [first.threadId, second.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })
    const applied = await repo.apply({
      tool: 'restore',
      threadIds: [first.threadId, second.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(2)
    expect(await forumCounts(LEFT)).toEqual(before.left)
    expect(await forumCounts(CATEGORY)).toEqual(before.category)
    expect(await userCounts(ADA)).toEqual(before.ada)
    expect(await userCounts(BOB)).toEqual(before.bob)
  })

  it('is a no-op the second time, and writes no second audit row', async () => {
    const { threadId } = await seedThread()

    expect(
      await repo.apply({
        tool: 'delete',
        threadIds: [threadId],
        postIds: [],
        actorUserId: MOD,
        at: AT,
      }),
    ).toBe(1)
    expect(
      await repo.apply({
        tool: 'delete',
        threadIds: [threadId],
        postIds: [],
        actorUserId: MOD,
        at: AT,
      }),
    ).toBe(0)

    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })
    expect(await auditActions()).toEqual(['inline.delete'])
  })

  it('deletes individual posts without touching the thread count', async () => {
    const { threadId, postIds } = await seedThread()

    const applied = await repo.apply({
      tool: 'delete',
      threadIds: [],
      postIds: [postIds[1]!],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(1)
    expect(await forumCounts(LEFT)).toEqual({ posts: 1, threads: 1 })
    expect(await userCounts(BOB)).toEqual({ posts: 0, threads: 0 })
    expect(await threadVisibility(threadId)).toBe('visible')
  })

  it('leaves a deleted thread deleted when the same chunk is asked to delete it again', async () => {
    const live = await seedThread({ title: 'Live' })
    const gone = await seedThread({ title: 'Gone' })
    await repo.apply({
      tool: 'delete',
      threadIds: [gone.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    const applied = await repo.apply({
      tool: 'delete',
      threadIds: [live.threadId, gone.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(1)
    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })
  })
})

describe('bulk approve', () => {
  it('publishes a held thread with its opening post and counts both', async () => {
    const { threadId, postIds } = await seedThread({ visibility: 'unapproved' })
    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })

    const applied = await repo.apply({
      tool: 'approve',
      threadIds: [threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(1)
    expect(await threadVisibility(threadId)).toBe('visible')
    expect(await postVisibility(postIds[0]!)).toBe('visible')
    expect(await postVisibility(postIds[1]!)).toBe('unapproved')
    expect(await forumCounts(LEFT)).toEqual({ posts: 1, threads: 1 })
    expect(await userCounts(ADA)).toEqual({ posts: 1, threads: 1 })
  })

  it('publishes a held reply on its own', async () => {
    const { threadId, postIds } = await seedThread({ visibility: 'unapproved' })
    await repo.apply({
      tool: 'approve',
      threadIds: [threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    const applied = await repo.apply({
      tool: 'approve',
      threadIds: [],
      postIds: [postIds[1]!],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(1)
    expect(await forumCounts(LEFT)).toEqual({ posts: 2, threads: 1 })
    expect(await userCounts(BOB)).toEqual({ posts: 1, threads: 0 })
  })
})

describe('bulk lock and pin', () => {
  it('flips the flag on the whole chunk in one statement', async () => {
    const first = await seedThread({ title: 'First' })
    const second = await seedThread({ title: 'Second' })

    const applied = await repo.apply({
      tool: 'lock',
      threadIds: [first.threadId, second.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(2)
    const rows = resultRows(
      await db.execute(sql`select is_locked from threads order by id`),
    ) as Array<{ is_locked: boolean }>
    expect(rows.map((r) => r.is_locked)).toEqual([true, true])
    expect(await auditActions()).toEqual(['inline.lock'])
  })

  it('counts only the threads whose flag actually changed', async () => {
    const first = await seedThread({ title: 'First' })
    const second = await seedThread({ title: 'Second' })
    await repo.apply({
      tool: 'lock',
      threadIds: [first.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    const applied = await repo.apply({
      tool: 'lock',
      threadIds: [first.threadId, second.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(1)
  })

  it('will not pin a deleted thread', async () => {
    const { threadId } = await seedThread()
    await repo.apply({
      tool: 'delete',
      threadIds: [threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    const applied = await repo.apply({
      tool: 'stick',
      threadIds: [threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(0)
  })
})

describe('bulk move', () => {
  it('debits one chain and credits the other, cancelling at the shared ancestor', async () => {
    const first = await seedThread({ forumId: LEFT, title: 'First' })
    const second = await seedThread({ forumId: LEFT, title: 'Second' })

    const applied = await repo.apply({
      tool: 'move',
      threadIds: [first.threadId, second.threadId],
      postIds: [],
      toForumId: RIGHT,
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(2)
    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })
    expect(await forumCounts(RIGHT)).toEqual({ posts: 4, threads: 2 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 4, threads: 2 })
    expect(await userCounts(ADA)).toEqual({ posts: 2, threads: 2 })
  })

  it('rewrites the denormalised forum id on every post', async () => {
    const { threadId } = await seedThread({ forumId: LEFT })

    await repo.apply({
      tool: 'move',
      threadIds: [threadId],
      postIds: [],
      toForumId: RIGHT,
      actorUserId: MOD,
      at: AT,
    })

    const rows = resultRows(
      await db.execute(sql`select distinct forum_id from posts where thread_id = ${threadId}`),
    ) as Array<{ forum_id: number }>
    expect(rows.map((r) => Number(r.forum_id))).toEqual([RIGHT])
  })

  it('records the forum it left as well as the one it arrived in', async () => {
    const { threadId } = await seedThread({ forumId: LEFT })

    await repo.apply({
      tool: 'move',
      threadIds: [threadId],
      postIds: [],
      toForumId: RIGHT,
      actorUserId: MOD,
      at: AT,
    })

    const rows = resultRows(
      await db.execute(sql`select detail from admin_log`),
    ) as Array<{ detail: Record<string, unknown> }>
    expect(rows[0]!.detail).toMatchObject({
      fromForumId: LEFT,
      toForumId: RIGHT,
      forumIds: [LEFT, RIGHT],
    })
  })

  it('moves nothing when the thread is already there', async () => {
    const { threadId } = await seedThread({ forumId: RIGHT })

    const applied = await repo.apply({
      tool: 'move',
      threadIds: [threadId],
      postIds: [],
      toForumId: RIGHT,
      actorUserId: MOD,
      at: AT,
    })

    expect(applied).toBe(0)
    expect(await forumCounts(RIGHT)).toEqual({ posts: 2, threads: 1 })
    expect(await auditActions()).toEqual([])
  })
})

describe('the audit trail', () => {
  it('writes one row per chunk, carrying every id it acted on', async () => {
    const first = await seedThread({ title: 'First' })
    const second = await seedThread({ title: 'Second' })

    await repo.apply({
      tool: 'lock',
      threadIds: [first.threadId, second.threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })

    const rows = resultRows(
      await db.execute(sql`select user_id, action, detail from admin_log`),
    ) as Array<{ user_id: number; action: string; detail: Record<string, unknown> }>

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: MOD, action: 'inline.lock' })
    expect(rows[0]!.detail).toMatchObject({
      threadIds: [first.threadId, second.threadId],
      applied: 2,
      forumId: LEFT,
      forumIds: [LEFT],
    })
  })

  it('writes nothing when nothing moved', async () => {
    const { threadId } = await seedThread()
    await repo.apply({
      tool: 'restore',
      threadIds: [threadId],
      postIds: [],
      actorUserId: MOD,
      at: AT,
    })
    expect(await auditActions()).toEqual([])
  })
})
