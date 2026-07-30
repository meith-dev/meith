/** F38 — buffered thread views, against real Postgres. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums, threads, threadViewBuffer, users } from './schema'
import { PostgresThreadViewBuffer } from './thread-views'

let harness: TestDb
let db: Database
let buffer: PostgresThreadViewBuffer

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  buffer = new PostgresThreadViewBuffer(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from thread_view_buffer`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
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
  await db.insert(forums).values({ id: 10, title: 'General', slug: 'general', path: '10' })
  await db.insert(threads).values([
    { id: 20, forumId: 10, title: 'A', slug: 'a', authorUserId: 1, authorUsername: 'ada' },
    { id: 21, forumId: 10, title: 'B', slug: 'b', authorUserId: 1, authorUsername: 'ada' },
  ])
})

async function viewCount(threadId: number): Promise<number> {
  const [row] = await db
    .select({ viewCount: threads.viewCount })
    .from(threads)
    .where(eq(threads.id, threadId))
  return row!.viewCount
}

describe('PostgresThreadViewBuffer', () => {
  it('accumulates views without touching the thread row', async () => {
    await buffer.record(20)
    await buffer.record(20)
    await buffer.record(21)

    // The point of the buffer: three views, zero writes to `threads`.
    expect(await viewCount(20)).toBe(0)

    const rows = await db.select().from(threadViewBuffer)
    expect(rows.map((r) => [r.threadId, r.pending])).toEqual(
      expect.arrayContaining([
        [20, 2],
        [21, 1],
      ]),
    )
  })

  it('flushes pending views into the threads and empties the buffer', async () => {
    await buffer.record(20)
    await buffer.record(20)
    await buffer.record(21)

    expect(await buffer.flush()).toBe(2)

    expect(await viewCount(20)).toBe(2)
    expect(await viewCount(21)).toBe(1)
    expect(await db.select().from(threadViewBuffer)).toEqual([])
  })

  it('adds to the existing count rather than replacing it', async () => {
    await buffer.record(20)
    await buffer.flush()
    await buffer.record(20)
    await buffer.flush()

    expect(await viewCount(20)).toBe(2)
  })

  it('flushes nothing when the buffer is empty', async () => {
    expect(await buffer.flush()).toBe(0)
  })

  it('is bounded per run so a backlog cannot outrun the function limit', async () => {
    await buffer.record(20)
    await buffer.record(21)

    expect(await buffer.flush(1)).toBe(1)
    // The unflushed thread is still buffered, not lost.
    expect(await db.select().from(threadViewBuffer)).toHaveLength(1)
    expect(await buffer.flush(1)).toBe(1)
  })
})
