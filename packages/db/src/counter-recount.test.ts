import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'

import type { Database } from './client'
import { PostgresCounterRecount, type RecountRun } from './counter-recount'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums, posts, threads, users } from './schema'

let harness: TestDb
let db: Database
let recount: PostgresCounterRecount

const AT = new Date('2026-07-30T12:00:00Z')

const CATEGORY = 1
const FORUM = 4
const SUBFORUM = 9

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  recount = new PostgresCounterRecount(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from counter_recount_state`)
  await db.execute(sql`delete from posts`)
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

  await db.insert(forums).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: FORUM, title: 'Forum', slug: 'forum', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: SUBFORUM, title: 'Sub', slug: 'sub', path: '1.4.9', depth: 2, parentId: FORUM },
  ])

  await db.insert(threads).values([
    {
      id: 20,
      forumId: FORUM,
      title: 'Hello',
      slug: 'hello',
      authorUserId: 1,
      authorUsername: 'ada',
      lastPostAt: AT,
    },
    {
      id: 21,
      forumId: SUBFORUM,
      title: 'Deeper',
      slug: 'deeper',
      authorUserId: 1,
      authorUsername: 'ada',
      lastPostAt: AT,
    },
  ])

  await db.insert(posts).values([
    { id: 30, threadId: 20, forumId: FORUM, authorUserId: 1, authorUsername: 'ada', message: 'a', isFirstPost: true, createdAt: AT },
    { id: 31, threadId: 20, forumId: FORUM, authorUserId: 1, authorUsername: 'ada', message: 'b', createdAt: new Date(AT.getTime() + 1000) },
    { id: 32, threadId: 21, forumId: SUBFORUM, authorUserId: 1, authorUsername: 'ada', message: 'c', isFirstPost: true, createdAt: new Date(AT.getTime() + 2000) },
  ])
})

async function fullSweep(batchSize = 500, maxRuns = 60): Promise<{ corrected: number; runs: RecountRun[] }> {
  const runs: RecountRun[] = []
  let corrected = 0
  for (let i = 0; i < maxRuns; i++) {
    const run = await recount.run(batchSize)
    runs.push(run)
    corrected += run.corrected
    if (run.completedPass) return { corrected, runs }
  }
  throw new Error(`recount did not complete a pass in ${maxRuns} runs`)
}

async function forumRow(id: number) {
  const [row] = await db.select().from(forums).where(eq(forums.id, id))
  return row!
}

describe('PostgresCounterRecount', () => {
  it('converges counters that were never maintained at all', async () => {
    const { corrected } = await fullSweep()
    expect(corrected).toBeGreaterThan(0)

    const [thread] = await db.select().from(threads).where(eq(threads.id, 20))
    expect(thread).toMatchObject({ replyCount: 1, firstPostId: 30, lastPostId: 31 })

    expect(await forumRow(CATEGORY)).toMatchObject({ threadCount: 2, postCount: 3, lastPostId: 32 })
    expect(await forumRow(FORUM)).toMatchObject({ threadCount: 2, postCount: 3, lastPostId: 32 })
    expect(await forumRow(SUBFORUM)).toMatchObject({ threadCount: 1, postCount: 1, lastPostId: 32 })

    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ postCount: 3, threadCount: 2 })
  })

  it('converges counters that were corrupted in the other direction', async () => {
    await fullSweep()
    await db.update(forums).set({ threadCount: 900, postCount: 900 }).where(eq(forums.id, CATEGORY))
    await db.update(threads).set({ replyCount: 77 }).where(eq(threads.id, 20))
    await db.update(users).set({ postCount: 42, threadCount: 42 }).where(eq(users.id, 1))

    await fullSweep()

    expect(await forumRow(CATEGORY)).toMatchObject({ threadCount: 2, postCount: 3 })
    const [thread] = await db.select().from(threads).where(eq(threads.id, 20))
    expect(thread!.replyCount).toBe(1)
    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user!.postCount).toBe(3)
  })

  it('corrects nothing on a second sweep', async () => {
    await fullSweep()

    const { corrected } = await fullSweep()
    expect(corrected).toBe(0)
  })

  it('excludes soft-deleted and unapproved content', async () => {
    await db.update(posts).set({ visibility: 'deleted' }).where(eq(posts.id, 31))
    await db.update(threads).set({ visibility: 'unapproved' }).where(eq(threads.id, 21))

    await fullSweep()

    const [thread] = await db.select().from(threads).where(eq(threads.id, 20))
    expect(thread).toMatchObject({ replyCount: 0, lastPostId: 30 })
    expect(await forumRow(CATEGORY)).toMatchObject({ threadCount: 1, postCount: 1 })
    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ postCount: 1, threadCount: 1 })
  })

  it('zeroes an author whose every post is inside a deleted thread', async () => {
    await fullSweep()
    await db.update(threads).set({ visibility: 'deleted' }).where(eq(threads.id, 20))
    await db.update(threads).set({ visibility: 'deleted' }).where(eq(threads.id, 21))

    await fullSweep()

    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ postCount: 0, threadCount: 0 })
  })

  it('resumes from the stored cursor instead of restarting the scan', async () => {
    const first = await recount.run(1)

    expect(first).toMatchObject({ phase: 'threads', scanned: 1 })
    expect(first.cursor).toBe(20)
    expect(await recount.state()).toMatchObject({ phase: 'threads', cursor: 20 })

    const second = await recount.run(1)
    expect(second).toMatchObject({ phase: 'threads', scanned: 1, cursor: 21 })

    const third = await recount.run(1)
    expect(third).toMatchObject({ phase: 'threads', scanned: 0, nextPhase: 'forums', cursor: 0 })
  })

  it('converges at a batch size of one, in bounded runs', async () => {
    const { runs } = await fullSweep(1)

    expect(Math.max(...runs.map((r) => r.scanned))).toBe(1)
    expect(await forumRow(CATEGORY)).toMatchObject({ threadCount: 2, postCount: 3 })
    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ postCount: 3, threadCount: 2 })
  })

  it('records completed passes and cumulative corrections for the operator', async () => {
    await fullSweep()
    const state = await recount.state()

    expect(state.passes).toBe(1)
    expect(state.corrected).toBeGreaterThan(0)
    expect(state.phase).toBe('threads')
    expect(state.cursor).toBe(0)
  })
})
