/**
 * F74's discovery views, against real Postgres.
 *
 * They share one private `page` helper, so the tests concentrate on the three
 * things that helper must get right for all four screens at once:
 *
 *  - **the permission filter is in the query**, and an empty scope means
 *    nothing rather than everything;
 *  - **paging is keyset on (last_post_at, id)**, because timestamps tie on a
 *    busy board and paging on the timestamp alone skips exactly the threads a
 *    member is most likely reading;
 *  - **"posted in" is one row per thread**, not one per post.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresDiscoveryRepository, type DiscoveryScope } from './discovery-repo'

let harness: TestDb
let db: Database
let repo: PostgresDiscoveryRepository

const OPEN = 1
const PRIVATE = 2
const ANN = 7
const BOB = 8

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresDiscoveryRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into forums (id, type, title, slug, path) values
      (${OPEN}, 'forum', 'Open', 'open', '1'),
      (${PRIVATE}, 'forum', 'Private', 'private', '2')
  `)
  for (const id of [ANN, BOB]) {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (${id}, ${`u${id}`}, ${`u${id}`}, ${`u${id}@example.test`},
              ${`u${id}@example.test`}, 'x', 'argon2id', 2)
    `)
  }
})

interface SeedThread {
  readonly id: number
  readonly forumId?: number
  readonly authorUserId?: number | null
  readonly replyCount?: number
  readonly lastPostAt?: string
  readonly visibility?: string
}

async function seedThread(thread: SeedThread): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, author_user_id, author_username, title, slug,
                         reply_count, last_post_at, visibility)
    values (${thread.id}, ${thread.forumId ?? OPEN}, ${thread.authorUserId ?? ANN}, 'ann',
            ${`Thread ${thread.id}`}, ${`t-${thread.id}`},
            ${thread.replyCount ?? 0},
            ${thread.lastPostAt ?? '2026-01-01T00:00:00Z'},
            ${thread.visibility ?? 'visible'})
  `)
}

async function seedPost(id: number, threadId: number, authorUserId: number, visibility = 'visible') {
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility)
    values (${id}, ${threadId}, ${OPEN}, ${authorUserId}, 'ann', 'hello', ${visibility})
  `)
}

const scope = (overrides: Partial<DiscoveryScope> = {}): DiscoveryScope => ({
  forumIds: [OPEN, PRIVATE],
  content: PUBLIC_CONTENT,
  viewerUserId: ANN,
  ...overrides,
})

const query = { limit: 10, after: null }
const EPOCH = new Date('2000-01-01T00:00:00Z')

describe('the permission filter', () => {
  it('returns nothing for an empty scope, rather than everything', async () => {
    /*
     * The claim every one of these screens rests on. Kills the mutant that
     * omits the forum clause when the list is empty — under which a member with
     * no visible forums is shown the entire board.
     */
    await seedThread({ id: 1 })

    expect((await repo.activeSince(EPOCH, query, scope({ forumIds: [] }))).rows).toEqual([])
  })

  it('lists only threads in forums the viewer may see', async () => {
    await seedThread({ id: 1, forumId: OPEN })
    await seedThread({ id: 2, forumId: PRIVATE })

    const page = await repo.activeSince(EPOCH, query, scope({ forumIds: [OPEN] }))
    expect(page.rows.map((row) => row.threadId)).toEqual([1])
  })

  it('hides threads the viewer’s content scope excludes', async () => {
    await seedThread({ id: 1 })
    await seedThread({ id: 2, visibility: 'deleted' })

    expect((await repo.activeSince(EPOCH, query, scope())).rows.map((r) => r.threadId))
      .toEqual([1])

    const staff = contentScopeFrom({ seesUnapproved: true, seesDeleted: true })
    expect(
      (await repo.activeSince(EPOCH, query, scope({ content: staff }))).rows.map((r) => r.threadId),
    ).toEqual([2, 1])
  })
})

describe('activeSince', () => {
  it('returns threads touched since the moment, newest first', async () => {
    await seedThread({ id: 1, lastPostAt: '2026-01-01T00:00:00Z' })
    await seedThread({ id: 2, lastPostAt: '2026-06-01T00:00:00Z' })

    const page = await repo.activeSince(new Date('2026-03-01T00:00:00Z'), query, scope())
    expect(page.rows.map((row) => row.threadId)).toEqual([2])
  })

  it('includes a thread touched exactly at the boundary', async () => {
    /*
     * `>=`, so "since my last visit" does not silently drop the post that
     * arrived in the same instant the visit was recorded.
     */
    await seedThread({ id: 1, lastPostAt: '2026-03-01T00:00:00Z' })

    const page = await repo.activeSince(new Date('2026-03-01T00:00:00Z'), query, scope())
    expect(page.rows.map((row) => row.threadId)).toEqual([1])
  })
})

describe('unanswered', () => {
  it('lists threads with no replies', async () => {
    await seedThread({ id: 1, replyCount: 0 })
    await seedThread({ id: 2, replyCount: 3 })

    expect((await repo.unanswered(query, scope())).rows.map((r) => r.threadId)).toEqual([1])
  })

  it('uses the board’s own counter rather than a second opinion', async () => {
    /*
     * A thread whose only reply was deleted is unanswered again, and
     * `reply_count` is the answer every other screen shows. Counting posts here
     * would drift from it — and the drift would appear only after a deletion,
     * which is exactly when somebody looks.
     */
    await seedThread({ id: 1, replyCount: 0 })
    await seedPost(10, 1, ANN)
    await seedPost(11, 1, BOB, 'deleted')

    expect((await repo.unanswered(query, scope())).rows.map((r) => r.threadId)).toEqual([1])
  })
})

describe('startedBy and participatedIn', () => {
  it('lists threads a member started', async () => {
    await seedThread({ id: 1, authorUserId: ANN })
    await seedThread({ id: 2, authorUserId: BOB })

    expect((await repo.startedBy(ANN, query, scope())).rows.map((r) => r.threadId)).toEqual([1])
  })

  it('lists a thread once however many times the member posted in it', async () => {
    /*
     * The reason this is an `exists` and not a join. A join returns one row per
     * post, so a member with two hundred posts in a thread fills the page with
     * one conversation — and the limit applies before any de-duplication, so
     * the page is also wrong. Kills the mutant that joins.
     */
    await seedThread({ id: 1, authorUserId: BOB })
    for (const id of [10, 11, 12]) await seedPost(id, 1, ANN)

    const page = await repo.participatedIn(ANN, query, scope())
    expect(page.rows.map((row) => row.threadId)).toEqual([1])
  })

  it('ignores a post the viewer’s scope hides', async () => {
    /*
     * A member whose only post in a thread was removed should not find it under
     * "threads I posted in" — the post they are looking for is not there.
     */
    await seedThread({ id: 1, authorUserId: BOB })
    await seedPost(10, 1, ANN, 'deleted')

    expect((await repo.participatedIn(ANN, query, scope())).rows).toEqual([])
  })

  it('finds nothing for a member who has posted nowhere', async () => {
    await seedThread({ id: 1, authorUserId: BOB })
    expect((await repo.participatedIn(ANN, query, scope())).rows).toEqual([])
  })
})

describe('paging', () => {
  it('pages by keyset and stops with a null cursor', async () => {
    for (let id = 1; id <= 5; id += 1) {
      await seedThread({ id, lastPostAt: `2026-01-0${id}T00:00:00Z` })
    }

    const first = await repo.activeSince(EPOCH, { limit: 2, after: null }, scope())
    expect(first.rows.map((row) => row.threadId)).toEqual([5, 4])
    expect(first.nextCursor).not.toBeNull()

    const seen = new Set(first.rows.map((row) => row.threadId))
    let cursor = first.nextCursor
    while (cursor !== null) {
      const page = await repo.activeSince(EPOCH, { limit: 2, after: cursor }, scope())
      for (const row of page.rows) seen.add(row.threadId)
      cursor = page.nextCursor
    }

    expect(seen.size).toBe(5)
  })

  it('does not lose threads whose last post landed in the same instant', async () => {
    /*
     * Timestamps tie on any busy board. Paging on the timestamp alone skips or
     * repeats across the boundary, and the threads it loses are the most active
     * ones — the ones a member opened this page to find. Kills the mutant that
     * drops the id tie-break.
     */
    for (let id = 1; id <= 6; id += 1) {
      await seedThread({ id, lastPostAt: '2026-05-05T12:00:00Z' })
    }

    const seen: number[] = []
    let cursor = null as Awaited<ReturnType<typeof repo.activeSince>>['nextCursor']
    do {
      const page = await repo.activeSince(EPOCH, { limit: 2, after: cursor }, scope())
      seen.push(...page.rows.map((row) => row.threadId))
      cursor = page.nextCursor
    } while (cursor !== null)

    expect(seen).toHaveLength(6)
    expect(new Set(seen).size).toBe(6)
  })
})

describe('the row', () => {
  it('carries the forum title and slug, so a listing needs no second query', async () => {
    /*
     * The slug is here because these lists cross the whole board and every row
     * links back to its forum with the canonical `/<id>-<slug>` address.
     * Fetching it per row is the N+1 the budget test exists to catch, so it
     * comes off the join that was already there.
     */
    await seedThread({ id: 1 })

    const row = (await repo.activeSince(EPOCH, query, scope())).rows[0]
    expect(row).toMatchObject({
      forumTitle: 'Open',
      forumSlug: 'open',
      title: 'Thread 1',
      replyCount: 0,
    })
  })
})
