import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PUBLIC_CONTENT } from '@meith/core'
import { expectQueryBudget } from '@meith/testkit'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresPostRepository } from './post-repo'
import { forums, posts, threads } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresPostRepository

async function seed(count: number): Promise<void> {
  await db.insert(forums).values({
    id: 1,
    type: 'forum',
    title: 'General',
    slug: 'general',
    path: '1',
    depth: 0,
    displayOrder: 0,
  })
  await db.insert(threads).values({
    id: 1,
    forumId: 1,
    title: 'Thread',
    slug: 'thread',
    authorUsername: 'ada',
  })
  await db.insert(posts).values(
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      threadId: 1,
      forumId: 1,
      authorUsername: 'ada',
      message: `Post ${index + 1}`,
      isFirstPost: index === 0,
    })),
  )
  await db.execute(sql`select setval(pg_get_serial_sequence('forums', 'id'), 1)`)
  await db.execute(sql`select setval(pg_get_serial_sequence('threads', 'id'), 1)`)
  await db.execute(sql`select setval(pg_get_serial_sequence('posts', 'id'), ${count})`)
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresPostRepository(db)
})

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
})

describe('PostgresPostRepository.listThread', () => {
  it('resumes by post id without resetting visible post numbers', async () => {
    await seed(5)
    await db.insert(posts).values({
      id: 99,
      threadId: 1,
      forumId: 1,
      authorUsername: 'mod',
      message: 'not public',
      visibility: 'unapproved',
    })

    const first = await repo.listThread(1, { limit: 2, scope: PUBLIC_CONTENT })
    const second = await repo.listThread(1, {
      afterId: first.nextAfterId!,
      limit: 2,
      scope: PUBLIC_CONTENT,
    })

    expect(first.rows.map((post) => [post.id, post.number])).toEqual([
      [1, 1],
      [2, 2],
    ])
    expect(second.rows.map((post) => [post.id, post.number])).toEqual([
      [3, 3],
      [4, 4],
    ])
    expect(await repo.findVisibleById(1, 1)).toBe(1)
    expect(await repo.findVisibleById(1, 99)).toBeNull()
  })

  it('costs one statement at both small and larger thread sizes', async () => {
    await seed(3)
    await expectQueryBudget(harness, 1, () =>
      repo.listThread(1, { limit: 20, scope: PUBLIC_CONTENT }),
    )

    await db.execute(sql`delete from posts`)
    await db.execute(sql`delete from threads`)
    await db.execute(sql`delete from forums`)
    await seed(50)
    const page = await expectQueryBudget(harness, 1, () =>
      repo.listThread(1, { limit: 20, scope: PUBLIC_CONTENT }),
    )

    expect(page.rows).toHaveLength(20)
    expect(page.nextAfterId).toBe(20)
  })
})

describe('PostgresPostRepository.locate', () => {
  it('gives the number a reader sees and the cursor for its page', async () => {
    await seed(50)

    expect(await repo.locate(1, 1, { scope: PUBLIC_CONTENT, pageSize: 20 })).toEqual({
      number: 1,
      page: 1,
      afterId: null,
    })
    expect(await repo.locate(1, 20, { scope: PUBLIC_CONTENT, pageSize: 20 })).toEqual({
      number: 20,
      page: 1,
      afterId: null,
    })
    expect(await repo.locate(1, 21, { scope: PUBLIC_CONTENT, pageSize: 20 })).toEqual({
      number: 21,
      page: 2,
      afterId: 20,
    })
    expect(await repo.locate(1, 41, { scope: PUBLIC_CONTENT, pageSize: 20 })).toEqual({
      number: 41,
      page: 3,
      afterId: 40,
    })
  })

  it('counts in the reader’s own scope, so a held post shifts nobody', async () => {
    await seed(5)
    await db.insert(posts).values({
      id: 99,
      threadId: 1,
      forumId: 1,
      authorUsername: 'mod',
      message: 'not public',
      visibility: 'unapproved',
    })

    expect(await repo.locate(1, 5, { scope: PUBLIC_CONTENT, pageSize: 20 })).toMatchObject({
      number: 5,
    })
    expect(await repo.locate(1, 99, { scope: PUBLIC_CONTENT, pageSize: 20 })).toBeNull()
  })

  it('answers nothing for a post in another thread', async () => {
    await seed(3)
    expect(await repo.locate(2, 1, { scope: PUBLIC_CONTENT, pageSize: 20 })).toBeNull()
  })
})

describe('PostgresPostRepository.locateFirstUnread', () => {
  it('lands on the very first post for a thread never read', async () => {
    await seed(5)
    expect(
      await repo.locateFirstUnread(
        1,
        { postId: 0, since: null },
        { scope: PUBLIC_CONTENT, pageSize: 20 },
      ),
    ).toEqual({ number: 1, page: 1, afterId: null })
  })

  it('lands on the first post past the marker, mid-thread', async () => {
    await seed(50)
    expect(
      await repo.locateFirstUnread(
        1,
        { postId: 20, since: null },
        { scope: PUBLIC_CONTENT, pageSize: 20 },
      ),
    ).toEqual({ number: 21, page: 2, afterId: 20 })
  })

  it('answers nothing once the marker has caught up to the last post', async () => {
    await seed(5)
    expect(
      await repo.locateFirstUnread(
        1,
        { postId: 5, since: null },
        { scope: PUBLIC_CONTENT, pageSize: 20 },
      ),
    ).toBeNull()
  })

  it('skips a deleted post outside the reader’s scope', async () => {
    await seed(3)
    await db.insert(posts).values({
      id: 4,
      threadId: 1,
      forumId: 1,
      authorUsername: 'mod',
      message: 'removed',
      visibility: 'deleted',
    })
    await db.insert(posts).values({
      id: 5,
      threadId: 1,
      forumId: 1,
      authorUsername: 'ada',
      message: 'still visible',
    })

    expect(
      await repo.locateFirstUnread(
        1,
        { postId: 3, since: null },
        { scope: PUBLIC_CONTENT, pageSize: 20 },
      ),
    ).toEqual({ number: 4, page: 1, afterId: null })
  })

  it('honours the forum-level mark-all-read timestamp alongside the marker', async () => {
    await seed(3)
    await db.execute(sql`update posts set created_at = '2026-01-01T00:00:00Z' where id <= 3`)
    const since = new Date('2026-08-01T00:00:00Z')
    await db.insert(posts).values({
      id: 4,
      threadId: 1,
      forumId: 1,
      authorUsername: 'ada',
      message: 'before the mark-all',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    })
    await db.insert(posts).values({
      id: 5,
      threadId: 1,
      forumId: 1,
      authorUsername: 'ada',
      message: 'after the mark-all',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    })

    expect(
      await repo.locateFirstUnread(
        1,
        { postId: 0, since },
        { scope: PUBLIC_CONTENT, pageSize: 20 },
      ),
    ).toEqual({ number: 5, page: 1, afterId: null })
  })
})
