/**
 * The query budget applied to real repository code, on a seeded board.
 *
 * This lives in the testkit rather than in `@forum/db` to keep the dependency
 * pointing one way: the testkit imports the database package, never the
 * reverse. It is also the proof that the helper is worth having — an assertion
 * that has only ever been run against a hand-built three-row fixture proves
 * nothing about a board with a real tree in it.
 */
import { PostgresForumRepository, schema } from '@forum/db'
import { createTestDb, type TestDb } from '@forum/db/pglite.fixture'
import { buildTree, flattenTree } from '@forum/forums'
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

describe('forum tree reads (F16)', () => {
  /*
   * F16's acceptance says "tree read is one query regardless of depth". Until
   * now that was asserted by reading the code. This measures it, against a tree
   * that is genuinely nested — a recursive implementation would cost one query
   * per level and pass on a flat fixture.
   */
  it('reads the whole tree in exactly one query', async () => {
    const { value, count } = await measureQueries(harness, () => repo.listAll())

    expect(count).toBe(1)
    expect(value.length).toBe(SMOKE_SCALE.forums + SMOKE_SCALE.categories)

    // And the tree really is deep enough for that claim to mean something.
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

    /*
     * Deliberately asserting the *un*cached cost. This is why
     * CachedForumRepository serves findById from the cached tree rather than
     * its own query — five lookups here are five round trips, and a board index
     * doing this per row is the classic N+1.
     */
    expect(count).toBe(ids.length)
  })
})

describe('moving a forum', () => {
  it('stays within a fixed budget regardless of subtree size', async () => {
    const rows = await repo.listAll()
    const category = rows.find((r) => r.type === 'category')
    const movable = rows.find((r) => r.type === 'forum' && r.parentId !== category?.id)

    expect(movable).toBeDefined()

    /*
     * Lock, read the tree, rewrite paths, set the parent, renumber siblings:
     * a constant number of statements, not one per descendant. A per-row
     * implementation would scale with the subtree and blow this.
     */
    await expectQueryBudget(harness, 8, () =>
      repo.move(movable!.id, { newParentId: category!.id }),
    )
  })
})

describe('the seeded board is big enough to mean something', () => {
  it('has more forums than a naive implementation has queries to spare', async () => {
    const forums = await harness.db.select({ id: schema.forums.id }).from(schema.forums)

    // If this ever shrinks below ~10, an N+1 would fit inside a plausible
    // budget and the assertions above would stop catching anything.
    expect(forums.length).toBeGreaterThanOrEqual(10)
  })
})
