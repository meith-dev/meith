import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { expectQueryBudget } from '@meith/testkit'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresReadStateRepository } from './read-state-repo'
import { forums, posts, threads, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresReadStateRepository

async function seed(threadCount: number): Promise<void> {
  await db
    .insert(users)
    .values({
      id: 50,
      username: 'ada',
      usernameLower: 'ada',
      email: 'ada@example.com',
      emailLower: 'ada@example.com',
      primaryGroupId: 2,
    })
    .onConflictDoNothing()
  await db.insert(forums).values({
    id: 1,
    type: 'forum',
    title: 'General',
    slug: 'general',
    path: '1',
    depth: 0,
    displayOrder: 0,
  })
  for (let index = 0; index < threadCount; index++) {
    const threadId = index + 1
    const postId = index + 1
    const at = new Date(`2026-07-30T${String(index % 24).padStart(2, '0')}:00:00Z`)
    await db.insert(threads).values({
      id: threadId,
      forumId: 1,
      title: `Thread ${threadId}`,
      slug: `thread-${threadId}`,
      authorUsername: 'ada',
      lastPostId: postId,
      lastPostUsername: 'ada',
      lastPostAt: at,
    })
    await db.insert(posts).values({
      id: postId,
      threadId,
      forumId: 1,
      authorUsername: 'ada',
      message: `Post ${postId}`,
      isFirstPost: true,
      createdAt: at,
    })
  }
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresReadStateRepository(db)
})

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from threads_read`)
  await db.execute(sql`delete from forums_read`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users where id = 50`)
})

describe('PostgresReadStateRepository', () => {
  it('keeps the highest post marker when a slower tab reports an older post', async () => {
    await seed(2)
    const now = new Date('2026-07-31T00:00:00Z')

    await repo.markThreadRead(50, 1, 2, now)
    await repo.markThreadRead(50, 1, 1, now)

    const state = await repo.forUser(50)
    expect(state.threadLastPostId.get(1)).toBe(2)
    expect(state.unreadForumIds).toEqual(new Set([1]))

    await repo.markForumsRead(50, [1], now)
    expect((await repo.forUser(50)).unreadForumIds).toEqual(new Set())
  })

  it('reads watermarks in a constant three statements', async () => {
    await seed(2)
    await expectQueryBudget(harness, 3, () => repo.forUser(50))

    await db.execute(sql`delete from posts`)
    await db.execute(sql`delete from threads`)
    await db.execute(sql`delete from forums`)
    await seed(50)
    const state = await expectQueryBudget(harness, 3, () => repo.forUser(50))

    expect(state.unreadForumIds).toEqual(new Set([1]))
  })

  describe('markerFor', () => {
    it('answers null markers for a thread and forum never touched', async () => {
      await seed(1)
      expect(await repo.markerFor(50, 1, 1)).toEqual({ lastReadPostId: null, forumReadAt: null })
    })

    it('carries the thread marker and the forum marker independently', async () => {
      await seed(2)
      const at = new Date('2026-07-31T00:00:00Z')

      await repo.markThreadRead(50, 1, 1, at)
      expect(await repo.markerFor(50, 1, 1)).toEqual({ lastReadPostId: 1, forumReadAt: null })
      expect(await repo.markerFor(50, 2, 1)).toEqual({ lastReadPostId: null, forumReadAt: null })

      await repo.markForumsRead(50, [1], at)
      expect(await repo.markerFor(50, 2, 1)).toEqual({ lastReadPostId: null, forumReadAt: at })
    })
  })
})
