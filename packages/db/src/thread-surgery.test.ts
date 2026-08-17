import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { rollUpAncestorCounters } from './content-counters'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import { forums, users } from './schema'
import { PostgresThreadSurgeryRepository } from './thread-surgery'
import { PostgresThreadWriteRepository } from './thread-writes'

let harness: TestDb
let db: Database
let repo: PostgresThreadSurgeryRepository
let writes: PostgresThreadWriteRepository

const CATEGORY = 1
const LEFT = 4
const RIGHT = 5

const ADA = 1
const BOB = 2
const MOD = 3
const AT = new Date('2026-07-30T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresThreadSurgeryRepository(db)
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
  ])
})

async function seedThread(
  forumId: number,
  title: string,
  replies: number,
): Promise<{ threadId: number; postIds: number[] }> {
  const thread = await writes.create({
    forumId,
    title,
    slug: title.toLowerCase().replace(/\W+/g, '-'),
    message: 'the opening post',
    prefixId: null,
    authorUserId: ADA,
    authorUsername: 'ada',
    visibility: 'visible',
    subscribe: false,
    createdAt: AT,
  })
  const postIds = [thread.postId]
  for (let n = 0; n < replies; n += 1) {
    const { postId } = await writes.createReply({
      threadId: thread.threadId,
      forumId,
      threadTitle: title,
      message: `reply ${n}`,
      authorUserId: BOB,
      authorUsername: 'bob',
      visibility: 'visible',
      subscribe: false,
      createdAt: new Date(AT.getTime() + (n + 1) * 60_000),
    })
    postIds.push(postId)
  }
  for (const id of postIds) await rollUpAncestorCounters(db, id)
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

async function threadRow(id: number): Promise<{
  reply_count: number
  last_post_id: number | null
  forum_id: number
} | null> {
  const rows = resultRows(
    await db.execute(sql`
      select reply_count, last_post_id, forum_id from threads where id = ${id}
    `),
  ) as Array<{ reply_count: number; last_post_id: number | null; forum_id: number }>
  const row = rows[0]
  return row === undefined
    ? null
    : {
        reply_count: Number(row.reply_count),
        last_post_id: row.last_post_id === null ? null : Number(row.last_post_id),
        forum_id: Number(row.forum_id),
      }
}

async function postsOf(threadId: number): Promise<Array<{ id: number; first: boolean }>> {
  const rows = resultRows(
    await db.execute(sql`
      select id, is_first_post from posts where thread_id = ${threadId} order by id
    `),
  ) as Array<{ id: number; is_first_post: boolean }>
  return rows.map((row) => ({ id: Number(row.id), first: row.is_first_post }))
}

describe('splitting', () => {
  it('moves the chosen posts and leaves the rest', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)
    const from = postIds[2]!

    const outcome = await repo.split({
      sourceThreadId: threadId,
      title: 'Split off',
      postIds: await repo.postsFrom(threadId, from),
      actorUserId: MOD,
      at: AT,
    })

    expect(outcome.posts).toBe(2)
    expect((await postsOf(threadId)).map((p) => p.id)).toEqual([postIds[0], postIds[1]])
    expect((await postsOf(outcome.threadId)).map((p) => p.id)).toEqual([postIds[2], postIds[3]])
  })

  it('marks the new thread"s earliest post as its opening one, and only that one', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)

    const outcome = await repo.split({
      sourceThreadId: threadId,
      title: 'Split off',
      postIds: await repo.postsFrom(threadId, postIds[2]!),
      actorUserId: MOD,
      at: AT,
    })

    expect(await postsOf(outcome.threadId)).toEqual([
      { id: postIds[2], first: true },
      { id: postIds[3], first: false },
    ])
    expect((await postsOf(threadId))[0]).toEqual({ id: postIds[0], first: true })
  })

  it('trades reply counts between the two threads', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)
    expect(await threadRow(threadId)).toMatchObject({ reply_count: 3 })

    const outcome = await repo.split({
      sourceThreadId: threadId,
      title: 'Split off',
      postIds: await repo.postsFrom(threadId, postIds[2]!),
      actorUserId: MOD,
      at: AT,
    })

    expect(await threadRow(threadId)).toMatchObject({ reply_count: 1 })
    expect(await threadRow(outcome.threadId)).toMatchObject({ reply_count: 1 })
  })

  it('adds a thread to the forum and moves no posts', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)
    expect(await forumCounts(LEFT)).toEqual({ posts: 4, threads: 1 })

    await repo.split({
      sourceThreadId: threadId,
      title: 'Split off',
      postIds: await repo.postsFrom(threadId, postIds[2]!),
      actorUserId: MOD,
      at: AT,
    })

    expect(await forumCounts(LEFT)).toEqual({ posts: 4, threads: 2 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 4, threads: 2 })
  })

  it('credits the new thread to its own opening author and moves no post counts', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)
    expect(await userCounts(ADA)).toEqual({ posts: 1, threads: 1 })
    expect(await userCounts(BOB)).toEqual({ posts: 3, threads: 0 })

    await repo.split({
      sourceThreadId: threadId,
      title: 'Split off',
      postIds: await repo.postsFrom(threadId, postIds[2]!),
      actorUserId: MOD,
      at: AT,
    })

    expect(await userCounts(ADA)).toEqual({ posts: 1, threads: 1 })
    expect(await userCounts(BOB)).toEqual({ posts: 3, threads: 1 })
  })

  it('repairs the last-post pointer on both threads', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)

    const outcome = await repo.split({
      sourceThreadId: threadId,
      title: 'Split off',
      postIds: await repo.postsFrom(threadId, postIds[2]!),
      actorUserId: MOD,
      at: AT,
    })

    expect(await threadRow(threadId)).toMatchObject({ last_post_id: postIds[1] })
    expect(await threadRow(outcome.threadId)).toMatchObject({ last_post_id: postIds[3] })
  })

  it('records the split with both ids', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)
    const outcome = await repo.split({
      sourceThreadId: threadId,
      title: 'Split off',
      postIds: await repo.postsFrom(threadId, postIds[2]!),
      actorUserId: MOD,
      at: AT,
    })

    const rows = resultRows(await db.execute(sql`select action, detail from admin_log`)) as Array<{
      action: string
      detail: Record<string, unknown>
    }>
    expect(rows[0]).toMatchObject({ action: 'thread.split' })
    expect(rows[0]!.detail).toMatchObject({
      threadId,
      newThreadId: outcome.threadId,
      forumId: LEFT,
      forumIds: [LEFT],
      posts: 2,
    })
  })

  it('will not take a post from another thread as the cut point', async () => {
    const a = await seedThread(LEFT, 'A', 1)
    const b = await seedThread(LEFT, 'B', 1)

    expect(await repo.postsFrom(a.threadId, b.postIds[1]!)).toEqual([])
    expect(await repo.postsFrom(b.threadId, a.postIds[1]!)).toEqual([])
  })

  it('will not take a hidden post as the cut point', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Original', 3)
    await db.execute(sql`update posts set visibility = 'unapproved' where id = ${postIds[2]!}`)

    expect(await repo.postsFrom(threadId, postIds[2]!)).toEqual([])
    expect(await repo.postsFrom(threadId, postIds[3]!)).toEqual([postIds[3]])
  })
})

describe('merging', () => {
  it('moves every post into the target and destroys the source', async () => {
    const target = await seedThread(LEFT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)

    const outcome = await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    expect(outcome).toMatchObject({ threadId: target.threadId, posts: 2 })
    expect(await threadRow(source.threadId)).toBeNull()
    expect((await postsOf(target.threadId)).map((p) => p.id)).toEqual([
      ...target.postIds,
      ...source.postIds,
    ])
  })

  it('leaves exactly one opening post', async () => {
    const target = await seedThread(LEFT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    const posts = await postsOf(target.threadId)
    expect(posts.filter((p) => p.first).map((p) => p.id)).toEqual([target.postIds[0]])
  })

  it('adds the absorbed posts to the target"s reply count', async () => {
    const target = await seedThread(LEFT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 2)

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    expect(await threadRow(target.threadId)).toMatchObject({ reply_count: 4 })
  })

  it('removes one thread from the forum and keeps every post, in the same forum', async () => {
    const target = await seedThread(LEFT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)
    expect(await forumCounts(LEFT)).toEqual({ posts: 4, threads: 2 })

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    expect(await forumCounts(LEFT)).toEqual({ posts: 4, threads: 1 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 4, threads: 1 })
  })

  it('moves the posts between chains when the forums differ', async () => {
    const target = await seedThread(RIGHT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)
    expect(await forumCounts(LEFT)).toEqual({ posts: 2, threads: 1 })
    expect(await forumCounts(RIGHT)).toEqual({ posts: 2, threads: 1 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 4, threads: 2 })

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    expect(await forumCounts(LEFT)).toEqual({ posts: 0, threads: 0 })
    expect(await forumCounts(RIGHT)).toEqual({ posts: 4, threads: 1 })
    expect(await forumCounts(CATEGORY)).toEqual({ posts: 4, threads: 1 })
  })

  it('rewrites the denormalised forum id on the absorbed posts', async () => {
    const target = await seedThread(RIGHT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    const rows = resultRows(
      await db.execute(sql`
        select distinct forum_id from posts where thread_id = ${target.threadId}
      `),
    ) as Array<{ forum_id: number }>
    expect(rows.map((r) => Number(r.forum_id))).toEqual([RIGHT])
  })

  it('takes one thread off the absorbed thread"s author and no posts off anybody', async () => {
    const target = await seedThread(LEFT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)
    expect(await userCounts(ADA)).toEqual({ posts: 2, threads: 2 })
    expect(await userCounts(BOB)).toEqual({ posts: 2, threads: 0 })

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    expect(await userCounts(ADA)).toEqual({ posts: 2, threads: 1 })
    expect(await userCounts(BOB)).toEqual({ posts: 2, threads: 0 })
  })

  it('repairs the pointers on the survivor and both chains', async () => {
    const target = await seedThread(RIGHT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)
    const newest = source.postIds[1]!

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    expect(await threadRow(target.threadId)).toMatchObject({ last_post_id: newest })

    const pointer = async (id: number): Promise<number | null> => {
      const rows = resultRows(
        await db.execute(sql`select last_post_id from forums where id = ${id}`),
      ) as Array<{ last_post_id: number | null }>
      return rows[0]!.last_post_id === null ? null : Number(rows[0]!.last_post_id)
    }
    expect(await pointer(LEFT)).toBeNull()
    expect(await pointer(RIGHT)).toBe(newest)
  })

  it('carries a held post across rather than losing it to the cascade', async () => {
    const target = await seedThread(LEFT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)
    await db.execute(sql`
      insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                         message, visibility, is_first_post, created_at)
      values (9999, ${source.threadId}, ${LEFT}, ${BOB}, 'bob', 'held', 'unapproved',
              false, ${AT})
    `)

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    expect((await postsOf(target.threadId)).map((p) => p.id)).toContain(9999)
  })

  it('records the merge with both ends', async () => {
    const target = await seedThread(RIGHT, 'Keep', 1)
    const source = await seedThread(LEFT, 'Absorb', 1)

    await repo.merge({
      sourceThreadId: source.threadId,
      targetThreadId: target.threadId,
      actorUserId: MOD,
      at: AT,
    })

    const rows = resultRows(await db.execute(sql`select action, detail from admin_log`)) as Array<{
      action: string
      detail: Record<string, unknown>
    }>
    expect(rows[0]).toMatchObject({ action: 'thread.merge' })
    expect(rows[0]!.detail).toMatchObject({
      threadId: source.threadId,
      targetThreadId: target.threadId,
      fromForumId: LEFT,
      toForumId: RIGHT,
      forumIds: [LEFT, RIGHT],
    })
  })
})

describe('visiblePostIdsIn', () => {
  it('returns the selected posts of this thread, in id order', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Mine', 2)

    const found = await repo.visiblePostIdsIn(threadId, [...postIds].reverse())
    expect(found).toEqual([...postIds].sort((a, b) => a - b))
  })

  it('drops a post of another thread rather than reporting it', async () => {
    const mine = await seedThread(LEFT, 'Mine', 1)
    const theirs = await seedThread(LEFT, 'Elsewhere', 1)

    expect(await repo.visiblePostIdsIn(mine.threadId, theirs.postIds)).toEqual([])
  })

  it('drops an id that does not exist', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Mine', 1)
    expect(await repo.visiblePostIdsIn(threadId, [postIds[0]!, 999_999])).toEqual([postIds[0]!])
  })

  it('drops a post that is not visible', async () => {
    const { threadId, postIds } = await seedThread(LEFT, 'Mine', 1)
    await db.execute(sql`update posts set visibility = 'deleted' where id = ${postIds[1]!}`)

    expect(await repo.visiblePostIdsIn(threadId, postIds)).toEqual([postIds[0]!])
  })

  it('asks nothing at all for an empty selection', async () => {
    const { threadId } = await seedThread(LEFT, 'Mine', 1)
    expect(await repo.visiblePostIdsIn(threadId, [])).toEqual([])
  })
})
