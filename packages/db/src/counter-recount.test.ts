/**
 * F38 — the recount, against real Postgres.
 *
 * The acceptance criterion this file exists for is the checkpoint's: a
 * deliberately corrupted board converges. Everything else here protects the two
 * properties that make it usable on a real board — it is bounded per run, and it
 * resumes where it stopped instead of restarting the scan.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'

import type { Database } from './client'
import { PostgresCounterRecount, type RecountRun } from './counter-recount'
import { createTestDb, type TestDb } from './pglite.fixture'
import { communities, posts, threads, users } from './schema'

let harness: TestDb
let db: Database
let recount: PostgresCounterRecount

const AT = new Date('2026-07-30T12:00:00Z')

const CATEGORY = 1
const COMMUNITY = 4
const SUBCOMMUNITY = 9

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

  await db.insert(communities).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: COMMUNITY, title: 'Community', slug: 'community', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: SUBCOMMUNITY, title: 'Sub', slug: 'sub', path: '1.4.9', depth: 2, parentId: COMMUNITY },
  ])

  // One thread in the community (2 posts) and one in its subcommunity (1 post).
  await db.insert(threads).values([
    {
      id: 20,
      communityId: COMMUNITY,
      title: 'Hello',
      slug: 'hello',
      authorUserId: 1,
      authorUsername: 'ada',
      lastPostAt: AT,
    },
    {
      id: 21,
      communityId: SUBCOMMUNITY,
      title: 'Deeper',
      slug: 'deeper',
      authorUserId: 1,
      authorUsername: 'ada',
      lastPostAt: AT,
    },
  ])

  await db.insert(posts).values([
    { id: 30, threadId: 20, communityId: COMMUNITY, authorUserId: 1, authorUsername: 'ada', message: 'a', isFirstPost: true, createdAt: AT },
    { id: 31, threadId: 20, communityId: COMMUNITY, authorUserId: 1, authorUsername: 'ada', message: 'b', createdAt: new Date(AT.getTime() + 1000) },
    { id: 32, threadId: 21, communityId: SUBCOMMUNITY, authorUserId: 1, authorUsername: 'ada', message: 'c', isFirstPost: true, createdAt: new Date(AT.getTime() + 2000) },
  ])
})

/** Run until a full sweep completes, or fail loudly rather than loop forever. */
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

async function communityRow(id: number) {
  const [row] = await db.select().from(communities).where(eq(communities.id, id))
  return row!
}

describe('PostgresCounterRecount', () => {
  it('converges counters that were never maintained at all', async () => {
    // Everything starts at zero: the state a board is in after an import, or
    // after content is inserted by anything other than the posting command.
    const { corrected } = await fullSweep()
    expect(corrected).toBeGreaterThan(0)

    const [thread] = await db.select().from(threads).where(eq(threads.id, 20))
    expect(thread).toMatchObject({ replyCount: 1, firstPostId: 30, lastPostId: 31 })

    // Community totals are subtree-inclusive, so the category carries everything.
    expect(await communityRow(CATEGORY)).toMatchObject({ threadCount: 2, postCount: 3, lastPostId: 32 })
    expect(await communityRow(COMMUNITY)).toMatchObject({ threadCount: 2, postCount: 3, lastPostId: 32 })
    expect(await communityRow(SUBCOMMUNITY)).toMatchObject({ threadCount: 1, postCount: 1, lastPostId: 32 })

    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ postCount: 3, threadCount: 2 })
  })

  it('converges counters that were corrupted in the other direction', async () => {
    await fullSweep()
    await db.update(communities).set({ threadCount: 900, postCount: 900 }).where(eq(communities.id, CATEGORY))
    await db.update(threads).set({ replyCount: 77 }).where(eq(threads.id, 20))
    await db.update(users).set({ postCount: 42, threadCount: 42 }).where(eq(users.id, 1))

    await fullSweep()

    expect(await communityRow(CATEGORY)).toMatchObject({ threadCount: 2, postCount: 3 })
    const [thread] = await db.select().from(threads).where(eq(threads.id, 20))
    expect(thread!.replyCount).toBe(1)
    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user!.postCount).toBe(3)
  })

  it('corrects nothing on a second sweep', async () => {
    await fullSweep()

    // Writing computed truth rather than a delta is what makes this hold, and
    // it is also how an operator can tell real drift from a noisy recount.
    const { corrected } = await fullSweep()
    expect(corrected).toBe(0)
  })

  it('excludes soft-deleted and unapproved content', async () => {
    await db.update(posts).set({ visibility: 'deleted' }).where(eq(posts.id, 31))
    await db.update(threads).set({ visibility: 'unapproved' }).where(eq(threads.id, 21))

    await fullSweep()

    const [thread] = await db.select().from(threads).where(eq(threads.id, 20))
    expect(thread).toMatchObject({ replyCount: 0, lastPostId: 30 })
    // The subcommunity's only thread is unapproved: neither it nor its post counts.
    expect(await communityRow(CATEGORY)).toMatchObject({ threadCount: 1, postCount: 1 })
    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ postCount: 1, threadCount: 1 })
  })

  it('zeroes an author whose every post is inside a deleted thread', async () => {
    await fullSweep()
    await db.update(threads).set({ visibility: 'deleted' }).where(eq(threads.id, 20))
    await db.update(threads).set({ visibility: 'deleted' }).where(eq(threads.id, 21))

    // The case an aggregate written with a WHERE instead of a FILTER gets
    // wrong: the author's rows vanish from the aggregate, so the update finds
    // nothing to correct and the stale count survives the recount.
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

    // A short batch means the table is exhausted and the next phase begins.
    const third = await recount.run(1)
    expect(third).toMatchObject({ phase: 'threads', scanned: 0, nextPhase: 'communities', cursor: 0 })
  })

  it('converges at a batch size of one, in bounded runs', async () => {
    const { runs } = await fullSweep(1)

    // Nothing in the sweep ever examined more than the batch allowed.
    expect(Math.max(...runs.map((r) => r.scanned))).toBe(1)
    expect(await communityRow(CATEGORY)).toMatchObject({ threadCount: 2, postCount: 3 })
    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ postCount: 3, threadCount: 2 })
  })

  it('records completed passes and cumulative corrections for the operator', async () => {
    await fullSweep()
    const state = await recount.state()

    expect(state.passes).toBe(1)
    expect(state.corrected).toBeGreaterThan(0)
    // A sweep ends where the next one begins.
    expect(state.phase).toBe('threads')
    expect(state.cursor).toBe(0)
  })
})
