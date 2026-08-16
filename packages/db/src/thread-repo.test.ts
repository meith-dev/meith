import { sql } from 'drizzle-orm'
import {
  ALL_THREAD_AUTHORS,
  NO_THREAD_AUTHORS,
  PUBLIC_CONTENT,
} from '@meith/core'
import { expectQueryBudget } from '@meith/testkit'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums, threads } from './schema'
import { PostgresThreadRepository } from './thread-repo'

let harness: TestDb
let db: Database
let repo: PostgresThreadRepository

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
  await db.insert(threads).values(
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      forumId: 1,
      title: `Thread ${index + 1}`,
      slug: `thread-${index + 1}`,
      authorUsername: 'ada',
      isSticky: index < 2,
      lastPostAt: new Date(
        index < 4
          ? '2026-07-30T08:00:00Z'
          : `2026-07-29T${String(index % 24).padStart(2, '0')}:00:00Z`,
      ),
    })),
  )
  await db.execute(
    sql`select setval(pg_get_serial_sequence('forums', 'id'), (select max(id) from forums))`,
  )
  await db.execute(
    sql`select setval(pg_get_serial_sequence('threads', 'id'), (select max(id) from threads))`,
  )
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresThreadRepository(db)
})

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)
})

describe('PostgresThreadRepository.listForum', () => {
  it('orders sticky threads first and resumes with the full stable sort key', async () => {
    await seed(5)

    const first = await repo.listForum(1, {
      limit: 2,
      scope: PUBLIC_CONTENT,
      authors: ALL_THREAD_AUTHORS,
    })
    const second = await repo.listForum(1, {
      after: first.nextCursor!,
      limit: 2,
      scope: PUBLIC_CONTENT,
      authors: ALL_THREAD_AUTHORS,
    })

    expect(first.rows.map((row) => row.id)).toEqual([2, 1])
    expect(second.rows.map((row) => row.id)).toEqual([4, 3])
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.id)),
    ).toHaveLength(4)
  })

  it('costs one statement at both small and larger board sizes', async () => {
    await seed(3)
    await expectQueryBudget(harness, 1, () =>
      repo.listForum(1, {
        limit: 25,
        scope: PUBLIC_CONTENT,
        authors: ALL_THREAD_AUTHORS,
      }),
    )

    await db.execute(sql`delete from threads`)
    await db.execute(sql`delete from forums`)
    await seed(50)
    const page = await expectQueryBudget(harness, 1, () =>
      repo.listForum(1, {
        limit: 25,
        scope: PUBLIC_CONTENT,
        authors: ALL_THREAD_AUTHORS,
      }),
    )

    expect(page.rows).toHaveLength(25)
    expect(page.nextCursor).not.toBeNull()
  })

  it('sorts rating aggregates with a stable next-page cursor', async () => {
    await seed(4)
    await db.execute(sql`
      update threads
         set rating_total = case id when 1 then 5 when 2 then 8 when 3 then 9 else 0 end,
             rating_count = case id when 1 then 1 when 2 then 2 when 3 then 3 else 0 end
    `)

    const first = await repo.listForum(1, {
      limit: 2,
      scope: PUBLIC_CONTENT,
      authors: ALL_THREAD_AUTHORS,
      sort: 'rating',
    })
    const second = await repo.listForum(1, {
      after: first.nextCursor!,
      limit: 2,
      scope: PUBLIC_CONTENT,
      authors: ALL_THREAD_AUTHORS,
      sort: 'rating',
    })

    expect(first.rows.map((row) => row.id)).toEqual([1, 2])
    expect(second.rows.map((row) => row.id)).toEqual([3, 4])
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.id)),
    ).toHaveLength(4)
  })
})

describe('a "your threads only" forum', () => {
  const ADA = 501
  const BEN = 502

  async function seedUsers(): Promise<void> {
    for (const id of [ADA, BEN]) {
      await db.execute(sql`
        insert into users (id, username, username_lower, email, email_lower,
                           password_hash, password_algo, primary_group_id)
        values (${id}, ${`u${id}`}, ${`u${id}`}, ${`u${id}@example.test`},
                ${`u${id}@example.test`}, 'x', 'argon2id', 2)
        on conflict (id) do nothing
      `)
    }
  }

  async function seedAuthored(): Promise<void> {
    await seed(4)
    await seedUsers()
    await db.execute(sql`
      update threads
         set author_user_id = case when id % 2 = 1 then ${ADA}::int else ${BEN}::int end,
             author_username = case when id % 2 = 1 then 'ada' else 'ben' end,
             is_sticky = false
    `)
  }

  it('lists only the threads the viewer started', async () => {
    await seedAuthored()

    const page = await repo.listForum(1, {
      limit: 25,
      scope: PUBLIC_CONTENT,
      authors: { kind: 'author', userId: ADA },
    })

    expect(page.rows.map((row) => row.id).sort()).toEqual([1, 3])
  })

  it('lists everything when the viewer may see other people’s threads', async () => {
    await seedAuthored()

    const page = await repo.listForum(1, {
      limit: 25,
      scope: PUBLIC_CONTENT,
      authors: ALL_THREAD_AUTHORS,
    })

    expect(page.rows.map((row) => row.id).sort()).toEqual([1, 2, 3, 4])
  })

  it('shows a guest nothing rather than the authorless rows', async () => {
    await seedAuthored()
    await db.execute(sql`update threads set author_user_id = null where id = 2`)

    const page = await repo.listForum(1, {
      limit: 25,
      scope: PUBLIC_CONTENT,
      authors: NO_THREAD_AUTHORS,
    })

    expect(page.rows).toEqual([])
  })

  it('refuses somebody else’s thread by id, so a guessed URL is a 404', async () => {
    await seedAuthored()

    const mine = await repo.findById(1, PUBLIC_CONTENT, {
      kind: 'author',
      userId: ADA,
    })
    const theirs = await repo.findById(2, PUBLIC_CONTENT, {
      kind: 'author',
      userId: ADA,
    })

    expect(mine?.id).toBe(1)
    expect(theirs).toBeNull()
  })

  it('keeps the author predicate in SQL, so the page still costs one statement', async () => {
    await seedAuthored()
    await expectQueryBudget(harness, 1, () =>
      repo.listForum(1, {
        limit: 25,
        scope: PUBLIC_CONTENT,
        authors: { kind: 'author', userId: ADA },
      }),
    )

    await db.execute(sql`delete from threads`)
    await db.execute(sql`delete from forums`)
    await seed(50)
    await seedUsers()
    await db.execute(sql`update threads set author_user_id = ${ADA}::int`)

    const page = await expectQueryBudget(harness, 1, () =>
      repo.listForum(1, {
        limit: 25,
        scope: PUBLIC_CONTENT,
        authors: { kind: 'author', userId: ADA },
      }),
    )

    expect(page.rows).toHaveLength(25)
  })
})
