import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@meith/core'

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

  await db.execute(sql`
    insert into forums (id, type, title, slug, path, parent_id, thread_count, post_count) values
      (${CATEGORY}, 'category', 'Main', 'main', '1', null, 6, 20),
      (${OPEN}, 'forum', 'Open', 'open', '1.2', ${CATEGORY}, 6, 20),
      (${SECRET}, 'forum', 'Staff room', 'staff', '3', null, 2, 5)
  `)

  await seedUser(ANN)
})

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
  ownThreadsOnlyForumIds: [],
  viewerUserId: null,
  content: PUBLIC_CONTENT,
  ...overrides,
})

describe('the rollup', () => {
  it('sums the root forums rather than double-counting the tree', async () => {
    const totals = await repo.rollUp(NOW)

    expect(totals.threadCount).toBe(8)
    expect(totals.postCount).toBe(25)
  })

  it('counts active members, not every row in the table', async () => {
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
    await seedUser(ANN, { createdAt: '2026-01-01T00:00:00Z' })
    await seedUser(BOB, { createdAt: '2026-04-01T00:00:00Z', state: 'awaiting_activation' })

    expect((await repo.rollUp(NOW)).newestUserId).toBe(ANN)
  })

  it('stamps when it ran, and reads back null before it ever has', async () => {
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
