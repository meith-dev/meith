/**
 * F75's statistics, against real Postgres.
 *
 * The rollup's tests are all about where the numbers come from. Summing the
 * root forums rather than counting `threads` and `posts` is the whole point —
 * F38 already maintains those counters and rolls them up the ancestor chain, so
 * a second opinion here would drift from the number every forum row shows, and
 * the drift would appear after a deletion, which is when somebody looks.
 *
 * The leaderboards' tests are all about the permission filter, for F72's
 * reason: ranking a fetched page returns ten threads as four, and the four are
 * not the top four.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@forum/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresStatsRepository, type StatsScope } from './stats-repo'

let harness: TestDb
let db: Database
let repo: PostgresStatsRepository

const CATEGORY = 1
const OPEN = 2
const SECRET = 3
const ANN = 7
const BOB = 8

const NOW = new Date('2026-05-05T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresStatsRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    update board_stats
       set thread_count = 0, post_count = 0, member_count = 0,
           newest_user_id = null, newest_username = null, computed_at = null
  `)

  /*
   * A category with a forum under it, plus a second root forum. The rollup sums
   * roots, so this shape is what proves it does not double-count the child.
   */
  await db.execute(sql`
    insert into forums (id, type, title, slug, path, parent_id, thread_count, post_count) values
      (${CATEGORY}, 'category', 'Main', 'main', '1', null, 6, 20),
      (${OPEN}, 'forum', 'Open', 'open', '1.2', ${CATEGORY}, 6, 20),
      (${SECRET}, 'forum', 'Staff room', 'staff', '3', null, 2, 5)
  `)

  /* Threads need an author; the rollup and member tests seed their own. */
  await seedUser(ANN)
})

/**
 * An upsert, because `beforeEach` seeds Ann so threads have an author and
 * several tests then want her with a different post count or state. Insert-only
 * would make each of those start by deleting a row it did not create.
 */
async function seedUser(
  id: number,
  options: { postCount?: number; state?: string; createdAt?: string } = {},
): Promise<void> {
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id,
                       post_count, state, created_at)
    values (${id}, ${`u${id}`}, ${`u${id}`}, ${`u${id}@example.test`},
            ${`u${id}@example.test`}, 'x', 'argon2id', 2,
            ${options.postCount ?? 0}, ${options.state ?? 'active'},
            ${options.createdAt ?? '2026-01-01T00:00:00Z'})
    on conflict (id) do update
       set post_count = excluded.post_count,
           state = excluded.state,
           created_at = excluded.created_at
  `)
}

async function seedThread(
  id: number,
  options: { forumId?: number; views?: number; replies?: number; visibility?: string } = {},
): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, author_user_id, author_username, title, slug,
                         view_count, reply_count, visibility)
    values (${id}, ${options.forumId ?? OPEN}, ${ANN}, 'ann',
            ${`Thread ${id}`}, ${`t-${id}`},
            ${options.views ?? 0}, ${options.replies ?? 0},
            ${options.visibility ?? 'visible'})
  `)
}

const scope = (overrides: Partial<StatsScope> = {}): StatsScope => ({
  forumIds: [OPEN],
  content: PUBLIC_CONTENT,
  ...overrides,
})

describe('the rollup', () => {
  it('sums the root forums rather than double-counting the tree', async () => {
    /*
     * F38 rolls a post up its whole ancestor chain, so the category already
     * holds its child's counters. Summing every forum would count the same
     * content twice — 12 threads on a board that has 8. Kills the mutant that
     * drops the `parent_id is null` filter.
     */
    const totals = await repo.rollUp(NOW)

    expect(totals.threadCount).toBe(8)
    expect(totals.postCount).toBe(25)
  })

  it('counts active members, not every row in the table', async () => {
    /*
     * A deleted account is not a member, and neither is one awaiting
     * confirmation. A member count that includes them is the number an operator
     * quotes when explaining why the board looks quieter than it says it is.
     */
    await seedUser(ANN)
    await seedUser(BOB, { state: 'deleted' })

    expect((await repo.rollUp(NOW)).memberCount).toBe(1)
  })

  it('names the newest active member', async () => {
    await seedUser(ANN, { createdAt: '2026-01-01T00:00:00Z' })
    await seedUser(BOB, { createdAt: '2026-04-01T00:00:00Z' })

    const totals = await repo.rollUp(NOW)
    expect(totals).toMatchObject({ newestUserId: BOB, newestUsername: 'u8' })
  })

  it('does not announce an account that has not been activated', async () => {
    /*
     * Putting a pending registration on the front page announces something that
     * may never happen — and on a board with e-mail confirmation, a name
     * anybody can claim without owning the address.
     */
    await seedUser(ANN, { createdAt: '2026-01-01T00:00:00Z' })
    await seedUser(BOB, { createdAt: '2026-04-01T00:00:00Z', state: 'awaiting_activation' })

    expect((await repo.rollUp(NOW)).newestUserId).toBe(ANN)
  })

  it('stamps when it ran, and reads back null before it ever has', async () => {
    /*
     * The page shows `computed_at` rather than implying "now". Null is what
     * distinguishes "not computed yet" from three convincing zeroes.
     */
    expect((await repo.readTotals()).computedAt).toBeNull()

    await repo.rollUp(NOW)
    expect((await repo.readTotals()).computedAt?.toISOString()).toBe(NOW.toISOString())
  })

  it('writes a computed truth, so running it twice changes nothing', async () => {
    await seedUser(ANN)

    const first = await repo.rollUp(NOW)
    const second = await repo.rollUp(NOW)
    expect(second).toEqual(first)
  })
})

describe('top posters', () => {
  it('ranks by post count and skips members who have posted nothing', async () => {
    await seedUser(ANN, { postCount: 3 })
    await seedUser(BOB, { postCount: 10 })
    await seedUser(9, { postCount: 0 })

    const top = await repo.topPosters(10)
    expect(top.map((row) => row.userId)).toEqual([BOB, ANN])
  })

  it('honours the limit', async () => {
    await seedUser(ANN, { postCount: 3 })
    await seedUser(BOB, { postCount: 10 })

    expect(await repo.topPosters(1)).toHaveLength(1)
  })
})

describe('the thread leaderboards', () => {
  it('rank by views and by replies independently', async () => {
    await seedThread(1, { views: 100, replies: 1 })
    await seedThread(2, { views: 5, replies: 50 })

    expect((await repo.mostViewed(10, scope())).map((r) => r.threadId)).toEqual([1, 2])
    expect((await repo.mostReplied(10, scope())).map((r) => r.threadId)).toEqual([2, 1])
  })

  it('leave out a thread in a forum the reader cannot see', async () => {
    /*
     * A "most viewed threads" table that includes the staff forum is a leak
     * with a ranking on it. Kills the mutant that drops the forum filter.
     */
    await seedThread(1, { forumId: OPEN, views: 5 })
    await seedThread(2, { forumId: SECRET, views: 500 })

    expect((await repo.mostViewed(10, scope())).map((r) => r.threadId)).toEqual([1])
  })

  it('return nothing for a reader who can see no forum', async () => {
    await seedThread(1, { views: 5 })
    expect(await repo.mostViewed(10, scope({ forumIds: [] }))).toEqual([])
  })

  it('leave out a thread the reader’s content scope hides', async () => {
    await seedThread(1, { views: 5 })
    await seedThread(2, { views: 500, visibility: 'deleted' })

    expect((await repo.mostViewed(10, scope())).map((r) => r.threadId)).toEqual([1])

    const staff = scope({ content: contentScopeFrom({ seesUnapproved: true, seesDeleted: true }) })
    expect((await repo.mostViewed(10, staff)).map((r) => r.threadId)).toEqual([2, 1])
  })

  it('carry the forum title, so the table needs no second query', async () => {
    await seedThread(1, { views: 5 })
    expect((await repo.mostViewed(10, scope()))[0]).toMatchObject({
      forumTitle: 'Open',
      title: 'Thread 1',
    })
  })
})
