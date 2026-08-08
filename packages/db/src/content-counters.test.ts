import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'

import type { Database } from './client'
import { applyCreatedContentCounters } from './content-counters'
import { createTestDb, type TestDb } from './pglite.fixture'
import { communities, outbox, posts, threads, users } from './schema'

let harness: TestDb
let db: Database

const AT = new Date('2026-07-30T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from outbox`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values({
    id: 1,
    username: 'ada',
    usernameLower: 'ada',
    email: 'ada@example.test',
    emailLower: 'ada@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })
  await db.insert(communities).values({ id: 10, title: 'General', slug: 'general', path: '10' })
  await db.insert(threads).values({
    id: 20,
    communityId: 10,
    title: 'Hello',
    slug: 'hello',
    authorUserId: 1,
    authorUsername: 'ada',
  })
})

async function addPost(id: number, isFirstPost: boolean): Promise<void> {
  await db.insert(posts).values({
    id,
    threadId: 20,
    communityId: 10,
    authorUserId: 1,
    authorUsername: 'ada',
    message: 'Hello',
    isFirstPost,
    createdAt: AT,
  })
}

describe('applyCreatedContentCounters', () => {
  it('updates direct community, thread and author counters with an outbox event', async () => {
    await addPost(30, true)
    await db.transaction((tx) =>
      applyCreatedContentCounters(tx, {
        postId: 30,
        threadId: 20,
        communityId: 10,
        authorId: 1,
        authorUsername: 'ada',
        threadTitle: 'Hello',
        createdAt: AT,
        isNewThread: true,
      }),
    )

    await addPost(31, false)
    await db.transaction((tx) =>
      applyCreatedContentCounters(tx, {
        postId: 31,
        threadId: 20,
        communityId: 10,
        authorId: 1,
        authorUsername: 'ada',
        threadTitle: 'Hello',
        createdAt: AT,
        isNewThread: false,
      }),
    )

    const [community] = await db.select().from(communities).where(eq(communities.id, 10))
    const [thread] = await db.select().from(threads).where(eq(threads.id, 20))
    const [user] = await db.select().from(users).where(eq(users.id, 1))

    expect(community).toMatchObject({ threadCount: 1, postCount: 2, lastPostId: 31 })
    expect(thread).toMatchObject({ firstPostId: 30, replyCount: 1, lastPostId: 31 })
    expect(user).toMatchObject({ threadCount: 1, postCount: 2 })
    expect(await db.select({ topic: outbox.topic }).from(outbox)).toEqual([
      { topic: 'post.created' },
      { topic: 'post.created' },
    ])
  })

  it('rolls counters and the outbox back with the content transaction', async () => {
    await addPost(30, true)

    await expect(
      db.transaction(async (tx) => {
        await applyCreatedContentCounters(tx, {
          postId: 30,
          threadId: 20,
          communityId: 10,
          authorId: 1,
          authorUsername: 'ada',
          threadTitle: 'Hello',
          createdAt: AT,
          isNewThread: true,
        })
        throw new Error('abort')
      }),
    ).rejects.toThrow('abort')

    const [community] = await db.select().from(communities).where(eq(communities.id, 10))
    expect(community).toMatchObject({ threadCount: 0, postCount: 0, lastPostId: null })
    expect(await db.select().from(outbox)).toEqual([])
  })
})
