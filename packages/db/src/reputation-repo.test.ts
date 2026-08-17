import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresReputationRepository } from './reputation-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresReputationRepository

const TARGET = 1
const RATER = 2
const OTHER = 3

const FORUM = 10
const THREAD = 20

const AT = new Date('2026-08-01T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresReputationRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from reputation`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${TARGET}, 'ada', 'ada', 'a@example.test', 'a@example.test', 'x', 'argon2id', 2),
           (${RATER}, 'bob', 'bob', 'b@example.test', 'b@example.test', 'x', 'argon2id', 2),
           (${OTHER}, 'cal', 'cal', 'c@example.test', 'c@example.test', 'x', 'argon2id', 2)
  `)
})

async function seedPost(postId: number): Promise<void> {
  await db.execute(sql`
    insert into forums (id, type, title, slug, path)
    values (${FORUM}, 'forum', 'A forum', 'a-forum', '/a-forum')
        on conflict (id) do nothing
  `)
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username)
    values (${THREAD}, ${FORUM}, 'A thread', 'a-thread', ${TARGET}, 'ada')
        on conflict (id) do nothing
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, is_first_post)
    values (${postId}, ${THREAD}, ${FORUM}, ${TARGET}, 'ada', 'Something.', true)
  `)
}

async function cachedTotal(userId = TARGET): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select reputation from users where id = ${userId}`),
  ) as Array<{ reputation: number }>
  return Number(rows[0]?.reputation ?? 0)
}

function give(overrides: Partial<Parameters<PostgresReputationRepository['give']>[0]> = {}) {
  return repo.give({
    userId: TARGET,
    givenByUserId: RATER,
    postId: null,
    points: 1,
    comment: 'Helpful.',
    maxPerDay: 0,
    at: AT,
    ...overrides,
  })
}

describe('the cached total', () => {
  it('is written by the rating, from the live rows', async () => {
    await give({ points: 1 })
    await give({ givenByUserId: OTHER, points: -1 })

    expect(await cachedTotal()).toBe(0)
  })

  it('repairs a corrupted column on the next write', async () => {
    await give({ points: 1 })
    await db.execute(sql`update users set reputation = 9999 where id = ${TARGET}`)

    await give({ givenByUserId: OTHER, points: 1 })
    expect(await cachedTotal()).toBe(2)
  })

  it('is repaired by an explicit recount', async () => {
    await give({ points: 1 })
    await db.execute(sql`update users set reputation = -50 where id = ${TARGET}`)

    expect(await repo.recount(TARGET)).toBe(1)
    expect(await cachedTotal()).toBe(1)
  })

  it('goes to zero rather than null when the last rating is withdrawn', async () => {
    await give({ points: 1 })
    const [row] = await repo.list({ userId: TARGET, limit: 10 })

    expect(await repo.withdraw({ ratingId: row!.id, givenByUserId: RATER })).toBe(true)
    expect(await cachedTotal()).toBe(0)
  })
})

describe('the uniqueness rules', () => {
  it('updates a profile rating rather than stacking a second', async () => {
    await give({ points: 1, comment: 'First thought.' })
    await give({ points: -1, comment: 'Second thought.' })

    const rows = await repo.list({ userId: TARGET, limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.points).toBe(-1)
    expect(rows[0]?.comment).toBe('Second thought.')
    expect(await cachedTotal()).toBe(-1)
  })

  it('keeps a profile rating and a post rating apart', async () => {
    await seedPost(100)
    await give({ postId: null, points: 1 })
    await give({ postId: 100, points: 1 })

    expect(await repo.list({ userId: TARGET, limit: 10 })).toHaveLength(2)
    expect(await cachedTotal()).toBe(2)
  })

  it('updates a post rating rather than stacking', async () => {
    await seedPost(100)
    await give({ postId: 100, points: 1 })
    await give({ postId: 100, points: 0 })

    const rows = await repo.list({ userId: TARGET, limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.points).toBe(0)
  })

  it('lets two different people rate the same post', async () => {
    await seedPost(100)
    await give({ postId: 100, givenByUserId: RATER })
    await give({ postId: 100, givenByUserId: OTHER })

    expect(await repo.list({ userId: TARGET, limit: 10 })).toHaveLength(2)
  })

  it('carries the thread id for a post rating, and nothing for a profile one', async () => {
    await seedPost(100)
    await give({ postId: 100 })
    await give({ postId: null, givenByUserId: OTHER })

    const rows = await repo.list({ userId: TARGET, limit: 10 })
    const post = rows.find((row) => row.postId !== null)
    const profile = rows.find((row) => row.postId === null)

    expect(post?.threadId).toBe(THREAD)
    expect(profile?.threadId).toBeNull()
  })
})

describe('the daily cap', () => {
  it('refuses a new rating once the cap is reached', async () => {
    expect(await give({ userId: TARGET, maxPerDay: 1 })).toBe(true)
    expect(await give({ userId: OTHER, maxPerDay: 1 })).toBe(false)

    expect(await repo.givenSince(RATER, new Date('2026-08-01T00:00:00Z'))).toBe(1)
  })

  it('does not charge an allowance for revising an existing rating', async () => {
    expect(await give({ maxPerDay: 1, points: 1 })).toBe(true)
    expect(await give({ maxPerDay: 1, points: -1 })).toBe(true)
    expect(await cachedTotal()).toBe(-1)
  })

  it('counts nothing against an uncapped rater', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await give({ userId: i % 2 === 0 ? TARGET : OTHER, maxPerDay: 0 })).toBe(true)
    }
  })

  it('counts only today', async () => {
    await give({ maxPerDay: 1, at: new Date('2026-07-31T12:00:00Z') })
    expect(await give({ userId: OTHER, maxPerDay: 1, at: AT })).toBe(true)
  })
})

describe('reads', () => {
  it('summarises the breakdown, not only the total', async () => {
    await give({ points: 1 })
    await give({ givenByUserId: OTHER, points: -1 })

    expect(await repo.summary(TARGET)).toEqual({
      total: 0,
      positive: 1,
      neutral: 0,
      negative: 1,
    })
  })

  it('returns zeroes for somebody nobody has rated', async () => {
    expect(await repo.summary(OTHER)).toEqual({
      total: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
    })
  })

  it('finds what this rater said, matching a null post id correctly', async () => {
    await give({ postId: null, comment: 'On the profile.' })

    const found = await repo.existing({ givenByUserId: RATER, userId: TARGET, postId: null })
    expect(found?.comment).toBe('On the profile.')
    expect(await repo.existing({ givenByUserId: OTHER, userId: TARGET, postId: null })).toBeNull()
  })

  it('names the giver, and says so when the account is gone', async () => {
    await give()
    expect((await repo.list({ userId: TARGET, limit: 10 }))[0]?.givenByUsername).toBe('bob')

    await db.execute(sql`delete from users where id = ${RATER}`)

    const rows = await repo.list({ userId: TARGET, limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.givenByUsername).toBeNull()
  })

  it('pages backwards on the rating id', async () => {
    await give({ givenByUserId: RATER })
    await give({ givenByUserId: OTHER })

    const page = await repo.list({ userId: TARGET, limit: 1 })
    const next = await repo.list({ userId: TARGET, limit: 1, before: page[0]!.id })

    expect(next).toHaveLength(1)
    expect(next[0]!.id).toBeLessThan(page[0]!.id)
  })
})

describe('the thread page’s batch reads', () => {
  beforeEach(async () => {
    await seedPost(100)
    await seedPost(101)
    await seedPost(102)
  })

  it('reports what this rater said about each post, and nothing about the rest', async () => {
    await give({ postId: 100, points: 1 })
    await give({ postId: 101, points: -1 })
    await give({ postId: 102, givenByUserId: OTHER, points: 1 })

    const mine = await repo.existingForPosts({
      givenByUserId: RATER,
      postIds: [100, 101, 102],
    })

    expect(mine.get(100)?.points).toBe(1)
    expect(mine.get(101)?.points).toBe(-1)
    expect(mine.has(102)).toBe(false)
  })

  it('does not mistake a profile rating for a post one', async () => {
    await give({ postId: null })

    const mine = await repo.existingForPosts({ givenByUserId: RATER, postIds: [100] })
    expect(mine.size).toBe(0)
  })

  it('asks nothing for an empty page', async () => {
    expect(await repo.existingForPosts({ givenByUserId: RATER, postIds: [] })).toEqual(new Map())
    expect(await repo.thanksForPosts([])).toEqual(new Map())
  })

  it('counts thanks per post, and does not net a negative off against them', async () => {
    await give({ postId: 100, givenByUserId: RATER, points: 1 })
    await give({ postId: 100, givenByUserId: OTHER, points: -1 })
    await give({ postId: 101, givenByUserId: RATER, points: 0 })

    const counts = await repo.thanksForPosts([100, 101, 102])

    expect(counts.get(100)).toBe(1)
    expect(counts.has(101)).toBe(false)
    expect(counts.has(102)).toBe(false)
  })
})

describe('withdrawing', () => {
  it('is scoped to the giver in the query', async () => {
    await give()
    const [row] = await repo.list({ userId: TARGET, limit: 10 })

    expect(await repo.withdraw({ ratingId: row!.id, givenByUserId: OTHER })).toBe(false)
    expect(await repo.list({ userId: TARGET, limit: 10 })).toHaveLength(1)
    expect(await cachedTotal()).toBe(1)
  })

  it('takes a post rating with its post', async () => {
    await seedPost(100)
    await give({ postId: 100 })

    await db.execute(sql`delete from posts where id = 100`)
    expect(await repo.list({ userId: TARGET, limit: 10 })).toEqual([])
  })
})
