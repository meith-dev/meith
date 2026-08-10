import { sql } from 'drizzle-orm'
import { PUBLIC_CONTENT } from '@meith/core'
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
})

describe('PostgresThreadRepository.listForum', () => {
  it('orders sticky threads first and resumes with the full stable sort key', async () => {
    await seed(5)

    const first = await repo.listForum(1, { limit: 2, scope: PUBLIC_CONTENT })
    const second = await repo.listForum(1, {
      after: first.nextCursor!,
      limit: 2,
      scope: PUBLIC_CONTENT,
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
      repo.listForum(1, { limit: 25, scope: PUBLIC_CONTENT }),
    )

    await db.execute(sql`delete from threads`)
    await db.execute(sql`delete from forums`)
    await seed(50)
    const page = await expectQueryBudget(harness, 1, () =>
      repo.listForum(1, { limit: 25, scope: PUBLIC_CONTENT }),
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
      sort: 'rating',
    })
    const second = await repo.listForum(1, {
      after: first.nextCursor!,
      limit: 2,
      scope: PUBLIC_CONTENT,
      sort: 'rating',
    })

    expect(first.rows.map((row) => row.id)).toEqual([1, 2])
    expect(second.rows.map((row) => row.id)).toEqual([3, 4])
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.id)),
    ).toHaveLength(4)
  })
})
