import { sql } from 'drizzle-orm'
import { PUBLIC_CONTENT } from '@meith/core'
import { expectQueryBudget } from '@meith/testkit'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums, posts, threads } from './schema'
import { PostgresPostRepository } from './post-repo'

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
    const second = await repo.listThread(1, { afterId: first.nextAfterId!, limit: 2, scope: PUBLIC_CONTENT })

    expect(first.rows.map((post) => [post.id, post.number])).toEqual([[1, 1], [2, 2]])
    expect(second.rows.map((post) => [post.id, post.number])).toEqual([[3, 3], [4, 4]])
    expect(await repo.findVisibleById(1, 1)).toBe(1)
    expect(await repo.findVisibleById(1, 99)).toBeNull()
  })

  it('costs one statement at both small and larger thread sizes', async () => {
    await seed(3)
    await expectQueryBudget(harness, 1, () => repo.listThread(1, { limit: 20, scope: PUBLIC_CONTENT }))

    await db.execute(sql`delete from posts`)
    await db.execute(sql`delete from threads`)
    await db.execute(sql`delete from forums`)
    await seed(50)
    const page = await expectQueryBudget(harness, 1, () => repo.listThread(1, { limit: 20, scope: PUBLIC_CONTENT }))

    expect(page.rows).toHaveLength(20)
    expect(page.nextAfterId).toBe(20)
  })
})
