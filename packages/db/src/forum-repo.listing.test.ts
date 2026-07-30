/**
 * F29 — the board index's read, against a real Postgres (PGlite).
 *
 * Two things need a database rather than a unit test:
 *
 *  - **the query count.** An N+1 does not fail a test; it passes, slowly, and
 *    only on a board large enough to notice. F11's budget helper counts
 *    statements at the driver, and the assertion compares two board *sizes* —
 *    a single fixture cannot tell "one query" from "one query per forum" when
 *    the fixture has one forum.
 *  - **the null shapes.** A forum with no posts has every last-post column null,
 *    and a forum whose author was deleted has `last_post_user_id` null with the
 *    username intact. Both are database states a mock would simply agree with.
 */
import { sql } from 'drizzle-orm'
import { expectQueryBudget } from '@forum/testkit'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresForumRepository } from './forum-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresForumRepository

/** `count` sibling forums under one category, each with a last post. */
async function seedBoard(count: number): Promise<void> {
  await db.insert(forums).values({
    id: 1,
    type: 'category',
    title: 'Category',
    slug: 'category',
    path: '1',
    depth: 0,
    displayOrder: 0,
  })

  for (let i = 0; i < count; i++) {
    const id = 100 + i
    await db.insert(forums).values({
      id,
      type: 'forum',
      title: `Forum ${i}`,
      slug: `forum-${i}`,
      parentId: 1,
      path: `1.${id}`,
      depth: 1,
      displayOrder: i,
      threadCount: i,
      postCount: i * 3,
      lastPostId: id * 10,
      lastPostThreadId: id,
      lastPostThreadTitle: `Thread in ${i}`,
      lastPostUserId: 1,
      lastPostUsername: 'ada',
      lastPostAt: new Date('2026-07-30T09:14:00Z'),
    })
  }

  await db.execute(
    sql`select setval(pg_get_serial_sequence('forums', 'id'), (select max(id) from forums))`,
  )
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresForumRepository(db)
})

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from forums`)
})

describe('listListing', () => {
  it('returns counters and the last post for every forum', async () => {
    await seedBoard(2)

    const rows = await repo.listListing()

    expect(rows).toHaveLength(3)
    const first = rows.find((r) => r.id === 100)!
    expect(first.threadCount).toBe(0)
    expect(first.postCount).toBe(0)
    expect(rows.find((r) => r.id === 101)!.postCount).toBe(3)
    expect(first.lastPost).toEqual({
      postId: 1000,
      threadId: 100,
      threadTitle: 'Thread in 0',
      userId: 1,
      username: 'ada',
      at: new Date('2026-07-30T09:14:00Z'),
    })
  })

  it('reports no last post for a forum that has none', async () => {
    await seedBoard(0)

    const rows = await repo.listListing()

    expect(rows).toHaveLength(1)
    expect(rows[0]!.lastPost).toBeNull()
    expect(rows[0]!.threadCount).toBe(0)
  })

  /*
   * `posts.author_user_id` is ON DELETE SET NULL and the denormalised username
   * is kept, so this is the state a board reaches the first time an account is
   * removed. The row must still carry a last post.
   */
  it('keeps the last post when its author was deleted', async () => {
    await seedBoard(1)
    await db.execute(sql`update forums set last_post_user_id = null where id = 100`)

    const row = (await repo.listListing()).find((r) => r.id === 100)!

    expect(row.lastPost).not.toBeNull()
    expect(row.lastPost!.userId).toBeNull()
    expect(row.lastPost!.username).toBe('ada')
  })

  /*
   * A half-written triplet — a counter bug, an interrupted import — must render
   * as "no posts yet" rather than as a link to post `null`, which is a 404 the
   * reader cannot explain.
   */
  it('treats a partially-written last post as absent', async () => {
    await seedBoard(1)
    await db.execute(sql`update forums set last_post_id = null where id = 100`)

    expect((await repo.listListing()).find((r) => r.id === 100)!.lastPost).toBeNull()
  })

  it('orders by display order, then id', async () => {
    await seedBoard(3)
    await db.execute(sql`update forums set display_order = 99 where id = 100`)

    expect((await repo.listListing()).map((r) => r.id)).toEqual([1, 101, 102, 100])
  })

  /*
   * The budget assertion, and why it compares two sizes: with one board, "one
   * query" and "one query per forum" are the same number. Twenty forums against
   * three must still be one statement.
   */
  it('costs one query regardless of how many forums exist', async () => {
    await seedBoard(2)
    await expectQueryBudget(harness, 1, () => repo.listListing())

    await db.execute(sql`delete from forums`)
    await seedBoard(20)
    const rows = await expectQueryBudget(harness, 1, () => repo.listListing())

    expect(rows).toHaveLength(21)
  })

  it('costs one query regardless of depth', async () => {
    await db.insert(forums).values([
      { id: 1, type: 'category', title: 'C', slug: 'c', path: '1', depth: 0, displayOrder: 0 },
      { id: 2, type: 'forum', title: 'A', slug: 'a', parentId: 1, path: '1.2', depth: 1, displayOrder: 0 },
      { id: 3, type: 'forum', title: 'B', slug: 'b', parentId: 2, path: '1.2.3', depth: 2, displayOrder: 0 },
      { id: 4, type: 'forum', title: 'D', slug: 'd', parentId: 3, path: '1.2.3.4', depth: 3, displayOrder: 0 },
    ])

    await expectQueryBudget(harness, 1, () => repo.listListing())
  })
})
