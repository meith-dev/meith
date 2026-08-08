/**
 * F62 — reputation against real Postgres.
 *
 * Four claims that only the database can settle:
 *
 *  - `users.reputation` is **derived, not incremented** — a test corrupts the
 *    column and watches the next write repair it, which is the only honest way
 *    to prove a cached total is recomputed;
 *  - the uniqueness rules are the two partial indexes, so re-rating updates
 *    rather than stacking, and a profile rating and a post rating coexist;
 *  - the daily cap is counted inside the writing transaction, and revising an
 *    existing rating does not spend an allowance;
 *  - withdrawing is scoped to the giver in the query, and recounts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

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

const COMMUNITY = 10
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
  await db.execute(sql`delete from communities`)
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
    insert into communities (id, type, title, slug, path)
    values (${COMMUNITY}, 'community', 'A community', 'a-community', '/a-community')
        on conflict (id) do nothing
  `)
  await db.execute(sql`
    insert into threads (id, community_id, title, slug, author_user_id, author_username)
    values (${THREAD}, ${COMMUNITY}, 'A thread', 'a-thread', ${TARGET}, 'ada')
        on conflict (id) do nothing
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, community_id, author_user_id, author_username,
                       message, is_first_post)
    values (${postId}, ${THREAD}, ${COMMUNITY}, ${TARGET}, 'ada', 'Something.', true)
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
    /*
     * The claim F62 rests on: the total is *recomputed*, not incremented. An
     * incremented total cannot survive a rating being revised or withdrawn, and
     * drifts silently when it does. Kills the mutant that replaces the recount
     * with `reputation = reputation + points`.
     */
    await give({ points: 1 })
    await db.execute(sql`update users set reputation = 9999 where id = ${TARGET}`)

    await give({ givenByUserId: OTHER, points: 1 })
    expect(await cachedTotal()).toBe(2)
  })

  it('is repaired by an explicit recount, for F70', async () => {
    await give({ points: 1 })
    await db.execute(sql`update users set reputation = -50 where id = ${TARGET}`)

    expect(await repo.recount(TARGET)).toBe(1)
    expect(await cachedTotal()).toBe(1)
  })

  it('goes to zero rather than null when the last rating is withdrawn', async () => {
    /*
     * `sum` over no rows is NULL, and NULL into a NOT NULL column is a
     * constraint violation on the happy path of somebody changing their mind.
     */
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
    /*
     * Two partial indexes, not one: rating somebody's post is a different
     * statement from rating them, and a board that collapsed the two would
     * silently overwrite one with the other.
     */
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
    /*
     * Making a correction cost an allowance would push people to leave a wrong
     * rating alone, which is the opposite of what a cap is for.
     */
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
    /*
     * `is not distinct from`: plain equality is never true against NULL, so a
     * naive `post_id = null` would make every profile rating look like a new
     * one and the form would never pre-fill.
     */
    await give({ postId: null, comment: 'On the profile.' })

    const found = await repo.existing({ givenByUserId: RATER, userId: TARGET, postId: null })
    expect(found?.comment).toBe('On the profile.')
    expect(await repo.existing({ givenByUserId: OTHER, userId: TARGET, postId: null })).toBeNull()
  })

  it('names the giver, and says so when the account is gone', async () => {
    await give()
    expect((await repo.list({ userId: TARGET, limit: 10 }))[0]?.givenByUsername).toBe('bob')

    /* SET NULL, not cascade: removing an account must not rewrite the total. */
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

/**
 * The two batch reads a thread page's Thanks controls need.
 *
 * They exist because asking per post is the N+1 on the board's heaviest page,
 * and their correctness is entirely about *scope*: one is scoped to the reader
 * and one deliberately is not, and swapping them would either show everybody
 * the same button state or count one person's thanks as everybody's.
 */
describe('the thread page’s batch reads', () => {
  beforeEach(async () => {
    await seedPost(100)
    await seedPost(101)
    await seedPost(102)
  })

  it('reports what this rater said about each post, and nothing about the rest', async () => {
    await give({ postId: 100, points: 1 })
    await give({ postId: 101, points: -1 })
    /* Somebody else's rating on a post this rater has not touched. */
    await give({ postId: 102, givenByUserId: OTHER, points: 1 })

    const mine = await repo.existingForPosts({
      givenByUserId: RATER,
      postIds: [100, 101, 102],
    })

    expect(mine.get(100)?.points).toBe(1)
    expect(mine.get(101)?.points).toBe(-1)
    /*
     * The scoping is in the `where` clause. A query that fetched every rating
     * on the page and filtered afterwards is one refactor away from showing a
     * reader somebody else's button state.
     */
    expect(mine.has(102)).toBe(false)
  })

  /* A profile rating has a null post id and is not what this asks about. */
  it('does not mistake a profile rating for a post one', async () => {
    await give({ postId: null })

    const mine = await repo.existingForPosts({ givenByUserId: RATER, postIds: [100] })
    expect(mine.size).toBe(0)
  })

  it('asks nothing for an empty page', async () => {
    expect(await repo.existingForPosts({ givenByUserId: RATER, postIds: [] })).toEqual(new Map())
    expect(await repo.thanksForPosts([])).toEqual(new Map())
  })

  /*
   * A **count of people**, not a sum of points. A sum would let one negative
   * cancel one thanks and show "2" on a post three people thanked — which is
   * not a thing either of them said.
   */
  it('counts thanks per post, and does not net a negative off against them', async () => {
    await give({ postId: 100, givenByUserId: RATER, points: 1 })
    await give({ postId: 100, givenByUserId: OTHER, points: -1 })
    await give({ postId: 101, givenByUserId: RATER, points: 0 })

    const counts = await repo.thanksForPosts([100, 101, 102])

    expect(counts.get(100)).toBe(1)
    /* A neutral is not a thanks, and an unrated post is absent rather than 0. */
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
    /* `on delete cascade` on `post_id`: a rating of a post that no longer
       exists is a rating of nothing. */
    await seedPost(100)
    await give({ postId: 100 })

    await db.execute(sql`delete from posts where id = 100`)
    expect(await repo.list({ userId: TARGET, limit: 10 })).toEqual([])
  })
})
