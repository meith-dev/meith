import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT } from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresSearchRepository } from './search-repo'
import { PostgresThreadToolsRepository } from './thread-tools'
import { PostgresThreadWriteRepository } from './thread-writes'
import { rollUpAncestorCounters } from './content-counters'
import { resultRows } from './result-rows'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresThreadToolsRepository
let writes: PostgresThreadWriteRepository

const CATEGORY = 1
const LEFT = 4
const RIGHT = 5
const NESTED = 6

const ADA = 1
const BOB = 2
const MOD = 3
const AT = new Date('2026-07-30T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresThreadToolsRepository(db)
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
    { id: NESTED, title: 'Nested', slug: 'nested', path: '1.4.6', depth: 2, parentId: LEFT },
  ])
})

async function seedThread(forumId = LEFT): Promise<{ threadId: number; postIds: number[] }> {
  const thread = await writes.create({
    forumId,
    title: 'Hello there',
    slug: 'hello-there',
    message: 'the opening post',
    prefixId: null,
    authorUserId: ADA,
    authorUsername: 'ada',
    visibility: 'visible',
    subscribe: false,
    createdAt: AT,
  })
  const { postId } = await writes.createReply({
    threadId: thread.threadId,
    forumId,
    threadTitle: 'Hello there',
    message: 'a reply',
    authorUserId: BOB,
    authorUsername: 'bob',
    visibility: 'visible',
    subscribe: false,
    createdAt: new Date(AT.getTime() + 60_000),
  })

  for (const id of [thread.postId, postId]) await rollUpAncestorCounters(db, id)
  return { threadId: thread.threadId, postIds: [thread.postId, postId] }
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

describe('lock and stick', () => {
  it('flips the flag and records who did it', async () => {
    const { threadId } = await seedThread()

    expect(
      await repo.setLocked({ threadId, locked: true, actorUserId: MOD, at: AT }),
    ).toBe(true)

    const found = await repo.find(threadId)
    expect(found).toMatchObject({ isLocked: true })
    expect(await auditActions()).toEqual(['thread.lock'])
  })

  it('is a no-op, and writes no audit row, when the flag is already set', async () => {
    const { threadId } = await seedThread()
    await repo.setLocked({ threadId, locked: true, actorUserId: MOD, at: AT })

    expect(
      await repo.setLocked({ threadId, locked: true, actorUserId: MOD, at: AT }),
    ).toBe(false)
    expect(await auditActions()).toEqual(['thread.lock'])
  })

  it('pins and unpins', async () => {
    const { threadId } = await seedThread()

    await repo.setSticky({ threadId, sticky: true, actorUserId: MOD, at: AT })
    expect(await repo.find(threadId)).toMatchObject({ isSticky: true })

    await repo.setSticky({ threadId, sticky: false, actorUserId: MOD, at: AT })
    expect(await repo.find(threadId)).toMatchObject({ isSticky: false })
    expect(await auditActions()).toEqual(['thread.stick', 'thread.stick'])
  })

  it('moves no counter', async () => {
    const { threadId } = await seedThread()
    const before = await forumCounts(LEFT)

    await repo.setLocked({ threadId, locked: true, actorUserId: MOD, at: AT })
    await repo.setSticky({ threadId, sticky: true, actorUserId: MOD, at: AT })

    expect(await forumCounts(LEFT)).toEqual(before)
  })
})

describe('deleting a thread', () => {
  it('takes its whole contribution off the forum and its ancestors', async () => {
    const { threadId } = await seedThread()
    expect(await forumCounts(LEFT)).toEqual({ posts: 2, threads: 1 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 2, threads: 1 })

    await repo.setVisibility({
      threadId,
      from: 'visible',
      to: 'deleted',
      actorUserId: MOD,
      at: AT,
    })

    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 0, threads: 0 })
  })

  it('subtracts each author"s own share', async () => {
    const { threadId } = await seedThread()
    expect(await userCounts(ADA)).toEqual({ posts: 1, threads: 1 })
    expect(await userCounts(BOB)).toEqual({ posts: 1, threads: 0 })

    await repo.setVisibility({
      threadId,
      from: 'visible',
      to: 'deleted',
      actorUserId: MOD,
      at: AT,
    })

    expect(await userCounts(ADA)).toEqual({ posts: 0, threads: 0 })
    expect(await userCounts(BOB)).toEqual({ posts: 0, threads: 0 })
  })

  it('leaves the posts" own visibility alone', async () => {
    const { threadId, postIds } = await seedThread()
    await repo.setVisibility({
      threadId,
      from: 'visible',
      to: 'deleted',
      actorUserId: MOD,
      at: AT,
    })

    const rows = resultRows(
      await db.execute(sql`
        select visibility from posts where id in (${postIds[0]!}, ${postIds[1]!})
      `),
    ) as Array<{ visibility: string }>
    expect(rows.map((r) => r.visibility)).toEqual(['visible', 'visible'])
  })

  it('puts everything back on restore', async () => {
    const { threadId } = await seedThread()
    const before = {
      left: await forumCounts(LEFT),
      category: await forumCounts(CATEGORY),
      ada: await userCounts(ADA),
      bob: await userCounts(BOB),
    }

    await repo.setVisibility({
      threadId,
      from: 'visible',
      to: 'deleted',
      actorUserId: MOD,
      at: AT,
    })
    await repo.setVisibility({
      threadId,
      from: 'deleted',
      to: 'visible',
      actorUserId: MOD,
      at: AT,
    })

    expect(await forumCounts(LEFT)).toEqual(before.left)
    expect(await forumCounts(CATEGORY)).toEqual(before.category)
    expect(await userCounts(ADA)).toEqual(before.ada)
    expect(await userCounts(BOB)).toEqual(before.bob)
  })

  it('keeps the roll-up ledger agreeing with reality', async () => {
    const { threadId } = await seedThread()
    const ledger = async (): Promise<number> =>
      resultRows(await db.execute(sql`select post_id from content_counter_rollups`)).length

    expect(await ledger()).toBe(2)

    await repo.setVisibility({
      threadId,
      from: 'visible',
      to: 'deleted',
      actorUserId: MOD,
      at: AT,
    })
    expect(await ledger()).toBe(0)

    await repo.setVisibility({
      threadId,
      from: 'deleted',
      to: 'visible',
      actorUserId: MOD,
      at: AT,
    })
    expect(await ledger()).toBe(2)
  })

  it('repairs the last-post pointer up the chain', async () => {
    const { threadId } = await seedThread()
    expect(
      (
        resultRows(
          await db.execute(sql`select last_post_id from forums where id = ${CATEGORY}`),
        ) as Array<{ last_post_id: number | null }>
      )[0]!.last_post_id,
    ).not.toBeNull()

    await repo.setVisibility({
      threadId,
      from: 'visible',
      to: 'deleted',
      actorUserId: MOD,
      at: AT,
    })

    for (const id of [LEFT, CATEGORY]) {
      const rows = resultRows(
        await db.execute(sql`select last_post_id from forums where id = ${id}`),
      ) as Array<{ last_post_id: number | null }>
      expect(rows[0]!.last_post_id).toBeNull()
    }
  })

  it('is a no-op on a second submit', async () => {
    const { threadId } = await seedThread()
    await repo.setVisibility({
      threadId,
      from: 'visible',
      to: 'deleted',
      actorUserId: MOD,
      at: AT,
    })
    const after = await forumCounts(LEFT)

    expect(
      await repo.setVisibility({
        threadId,
        from: 'visible',
        to: 'deleted',
        actorUserId: MOD,
        at: AT,
      }),
    ).toBe(false)
    expect(await forumCounts(LEFT)).toEqual(after)
    expect(await auditActions()).toEqual(['thread.delete'])
  })
})

describe('moving a thread', () => {
  async function move(threadId: number, to: number): Promise<boolean> {
    return repo.move({
      threadId,
      fromForumId: LEFT,
      toForumId: to,
      actorUserId: MOD,
      at: AT,
    })
  }

  it('takes the counts out of one forum and puts them in the other', async () => {
    const { threadId } = await seedThread()
    expect(await forumCounts(LEFT)).toEqual({ posts: 2, threads: 1 })
    expect(await forumCounts(RIGHT)).toEqual({ posts: 0, threads: 0 })

    expect(await move(threadId, RIGHT)).toBe(true)

    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })
    expect(await forumCounts(RIGHT)).toEqual({ posts: 2, threads: 1 })
  })

  it('leaves a shared ancestor exactly where it was', async () => {
    const { threadId } = await seedThread()
    const before = await forumCounts(CATEGORY)

    await move(threadId, RIGHT)

    expect(await forumCounts(CATEGORY)).toEqual(before)
  })

  it('carries the counts down into a nested destination", ancestors included', async () => {
    const { threadId } = await seedThread()

    await move(threadId, NESTED)

    expect(await forumCounts(NESTED)).toEqual({ posts: 2, threads: 1 })
    expect(await forumCounts(LEFT)).toEqual({ posts: 2, threads: 1 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 2, threads: 1 })
  })

  it('rewrites the denormalised forum id on every post', async () => {
    const { threadId } = await seedThread()

    await move(threadId, RIGHT)

    const rows = resultRows(
      await db.execute(sql`select distinct forum_id from posts where thread_id = ${threadId}`),
    ) as Array<{ forum_id: number }>
    expect(rows.map((r) => Number(r.forum_id))).toEqual([RIGHT])
  })

  it('does not touch author counts: a move changes where, not how much', async () => {
    const { threadId } = await seedThread()
    const before = { ada: await userCounts(ADA), bob: await userCounts(BOB) }

    await move(threadId, RIGHT)

    expect(await userCounts(ADA)).toEqual(before.ada)
    expect(await userCounts(BOB)).toEqual(before.bob)
  })

  it('repairs the last-post pointer on both chains', async () => {
    const { threadId, postIds } = await seedThread()
    const newest = postIds[1]!

    await move(threadId, RIGHT)

    const pointer = async (id: number): Promise<number | null> => {
      const rows = resultRows(
        await db.execute(sql`select last_post_id from forums where id = ${id}`),
      ) as Array<{ last_post_id: number | null }>
      return rows[0]!.last_post_id === null ? null : Number(rows[0]!.last_post_id)
    }

    expect(await pointer(LEFT)).toBeNull()
    expect(await pointer(RIGHT)).toBe(newest)
    expect(await pointer(CATEGORY)).toBe(newest)
  })

  it('records the move with both ends', async () => {
    const { threadId } = await seedThread()
    await move(threadId, RIGHT)

    const rows = resultRows(
      await db.execute(sql`select action, detail from admin_log`),
    ) as Array<{ action: string; detail: { from: number; to: number; posts: number } }>

    expect(rows[0]).toMatchObject({ action: 'thread.move' })
    expect(rows[0]!.detail).toMatchObject({ from: LEFT, to: RIGHT, posts: 2 })
  })

  it('is a no-op when the thread is not where the caller thought', async () => {
    const { threadId } = await seedThread()
    await move(threadId, RIGHT)

    expect(await move(threadId, NESTED)).toBe(false)
    expect(await forumCounts(RIGHT)).toEqual({ posts: 2, threads: 1 })
  })
})

describe('copy', () => {
  it('duplicates the thread and its posts into the destination', async () => {
    const { threadId } = await seedThread(LEFT)

    const copy = await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    expect(copy.posts).toBe(2)
    expect(copy.threadId).not.toBe(threadId)

    const rows = resultRows(
      await db.execute(
        sql`select message, is_first_post from posts where thread_id = ${copy.threadId} order by id`,
      ),
    ) as Array<{ message: string; is_first_post: boolean }>
    expect(rows.map((r) => r.message)).toEqual(['the opening post', 'a reply'])
    expect(rows.map((r) => r.is_first_post)).toEqual([true, false])
  })

  it('carries F72’s index across, so the copy is findable at once', async () => {
    const { threadId } = await seedThread(LEFT)
    const copy = await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    const found = await new PostgresSearchRepository(db).search(
      { terms: 'hello', grouping: 'posts', sort: 'relevance', limit: 10, after: null },
      { forumIds: [RIGHT], viewerUserId: null, content: PUBLIC_CONTENT },
    )
    expect(found.hits.map((hit) => hit.threadId)).toEqual([copy.threadId])
    expect((await new PostgresSearchRepository(db).indexProgress()).pending).toBe(0)
  })

  it('leaves the source thread and its forum completely untouched', async () => {
    const { threadId } = await seedThread(LEFT)
    const before = await forumCounts(LEFT)

    await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    expect(await forumCounts(LEFT)).toEqual(before)
    const stillThere = resultRows(
      await db.execute(sql`select count(*)::int as n from posts where thread_id = ${threadId}`),
    ) as Array<{ n: number }>
    expect(Number(stillThere[0]!.n)).toBe(2)
  })

  it('credits the destination forum and every ancestor', async () => {
    const { threadId } = await seedThread(LEFT)

    await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    expect(await forumCounts(RIGHT)).toEqual({ posts: 2, threads: 1 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 4, threads: 2 })
  })

  it('credits every author a second time, as MyBB does', async () => {
    const { threadId } = await seedThread(LEFT)
    expect(await userCounts(ADA)).toEqual({ posts: 1, threads: 1 })
    expect(await userCounts(BOB)).toEqual({ posts: 1, threads: 0 })

    await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    expect(await userCounts(ADA)).toEqual({ posts: 2, threads: 2 })
    expect(await userCounts(BOB)).toEqual({ posts: 2, threads: 0 })
  })

  it('copies only the visible posts', async () => {
    const { threadId, postIds } = await seedThread(LEFT)
    await db.execute(sql`update posts set visibility = 'deleted' where id = ${postIds[1]!}`)

    const copy = await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    expect(copy.posts).toBe(1)
    expect(await forumCounts(RIGHT)).toEqual({ posts: 1, threads: 1 })
  })

  it('points the copy at its own opening post, not the source"s', async () => {
    const { threadId } = await seedThread(LEFT)
    const copy = await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    const rows = resultRows(
      await db.execute(
        sql`select first_post_id, reply_count, last_post_id from threads where id = ${copy.threadId}`,
      ),
    ) as Array<{ first_post_id: number; reply_count: number; last_post_id: number }>
    const own = resultRows(
      await db.execute(sql`select id from posts where thread_id = ${copy.threadId} order by id`),
    ) as Array<{ id: number }>

    expect(Number(rows[0]!.first_post_id)).toBe(Number(own[0]!.id))
    expect(Number(rows[0]!.last_post_id)).toBe(Number(own[1]!.id))
    expect(Number(rows[0]!.reply_count)).toBe(1)
  })

  it('logs the act with both thread ids', async () => {
    const { threadId } = await seedThread(LEFT)
    const copy = await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    const rows = resultRows(
      await db.execute(sql`select action, detail from admin_log where action = 'thread.copy'`),
    ) as Array<{ action: string; detail: Record<string, unknown> }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.detail).toMatchObject({
      threadId,
      toForumId: RIGHT,
      newThreadId: copy.threadId,
      posts: 2,
    })
  })

  it('puts the copies in the roll-up ledger', async () => {
    const { threadId } = await seedThread(LEFT)
    const copy = await repo.copy({ threadId, toForumId: RIGHT, actorUserId: MOD, at: AT })

    const rows = resultRows(
      await db.execute(sql`
        select count(*)::int as n from content_counter_rollups r
          join posts p on p.id = r.post_id
         where p.thread_id = ${copy.threadId}
      `),
    ) as Array<{ n: number }>
    expect(Number(rows[0]!.n)).toBe(2)
  })
})
