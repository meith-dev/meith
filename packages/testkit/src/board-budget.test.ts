import { PostgresForumRepository, schema } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { buildTree, flattenTree } from '@meith/forums'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { expectQueryBudget, measureQueries } from './query-budget'
import { SMOKE_SCALE, seedBoard } from './seed'

let harness: TestDb
let repo: PostgresForumRepository

beforeAll(async () => {
  harness = await createTestDb()
  await seedBoard(harness.db, SMOKE_SCALE)
  repo = new PostgresForumRepository(harness.db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

describe('forum tree reads', () => {
  it('reads the whole tree in exactly one query', async () => {
    const { value, count } = await measureQueries(harness, () => repo.listAll())

    expect(count).toBe(1)
    expect(value.length).toBe(SMOKE_SCALE.forums + SMOKE_SCALE.categories)

    const depth = Math.max(...value.map((f) => f.depth))
    expect(depth).toBeGreaterThanOrEqual(2)
  })

  it('builds and flattens the tree without touching the database again', async () => {
    const rows = await repo.listAll()

    await expectQueryBudget(harness, 0, async () => {
      const tree = buildTree(rows)
      expect(flattenTree(tree)).toHaveLength(rows.length)
    })
  })

  it('costs one query per forum lookup, so callers know to use the cache', async () => {
    const rows = await repo.listAll()
    const ids = rows.slice(0, 5).map((r) => r.id)

    const { count } = await measureQueries(harness, async () => {
      for (const id of ids) await repo.findById(id)
    })

    expect(count).toBe(ids.length)
  })
})

describe('moving a forum', () => {
  it('stays within a fixed budget regardless of subtree size', async () => {
    const rows = await repo.listAll()
    const category = rows.find((r) => r.type === 'category')
    const movable = rows.find((r) => r.type === 'forum' && r.parentId !== category?.id)

    expect(movable).toBeDefined()

    await expectQueryBudget(harness, 8, () =>
      repo.move(movable!.id, { newParentId: category!.id }),
    )
  })
})

describe('the seeded board is big enough to mean something', () => {
  it('has more forums than a naive implementation has queries to spare', async () => {
    const forums = await harness.db.select({ id: schema.forums.id }).from(schema.forums)

    expect(forums.length).toBeGreaterThanOrEqual(10)
  })
})
