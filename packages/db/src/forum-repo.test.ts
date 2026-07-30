/**
 * F16 against a real Postgres (PGlite).
 *
 * The planner is unit-tested in `@forum/forums`; what needs a database is the
 * part that only SQL can get wrong — that the `VALUES`-join rewrite touches
 * exactly the subtree, that the whole move commits or none of it does, and that
 * the unique indexes actually hold.
 */
import { buildTree, planMove } from '@forum/forums'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresForumRepository } from './forum-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresForumRepository

/**
 *  1 Category one          '1'
 *    4 General             '1.4'
 *      9 Off-topic         '1.4.9'
 *        12 Deep           '1.4.9.12'
 *  2 Category two          '2'
 *  40 Forty                '1.40'   — shares a numeric prefix with 1.4
 */
async function seedTree(): Promise<void> {
  await db.insert(forums).values([
    { id: 1, type: 'category', title: 'Category one', slug: 'cat-one', path: '1', depth: 0, displayOrder: 0 },
    { id: 2, type: 'category', title: 'Category two', slug: 'cat-two', path: '2', depth: 0, displayOrder: 1 },
    { id: 4, type: 'forum', title: 'General', slug: 'general', parentId: 1, path: '1.4', depth: 1, displayOrder: 0 },
    { id: 9, type: 'forum', title: 'Off-topic', slug: 'off-topic', parentId: 4, path: '1.4.9', depth: 2, displayOrder: 0 },
    { id: 12, type: 'forum', title: 'Deep', slug: 'deep', parentId: 9, path: '1.4.9.12', depth: 3, displayOrder: 0 },
    { id: 40, type: 'forum', title: 'Forty', slug: 'forty', parentId: 1, path: '1.40', depth: 1, displayOrder: 1 },
  ])
}

async function pathsById(): Promise<Map<number, { path: string; depth: number; parentId: number | null }>> {
  const rows = await db
    .select({ id: forums.id, path: forums.path, depth: forums.depth, parentId: forums.parentId })
    .from(forums)
  return new Map(rows.map((r) => [r.id, { path: r.path, depth: r.depth, parentId: r.parentId }]))
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresForumRepository(db)
})

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from forums`)
  await seedTree()
})

describe('listAll', () => {
  it('reads the whole tree in one query and rebuilds it', async () => {
    const rows = await repo.listAll()
    expect(rows).toHaveLength(6)

    const tree = buildTree(rows)
    expect(tree.map((n) => n.id)).toEqual([1, 2])
    const general = tree[0]?.children.find((c) => c.id === 4)
    expect(general?.children[0]?.children[0]?.id).toBe(12)
  })
})

describe('move', () => {
  it('rewrites every descendant path, four levels deep', async () => {
    await repo.move(4, { newParentId: 2 })

    const after = await pathsById()
    expect(after.get(4)?.path).toBe('2.4')
    expect(after.get(9)?.path).toBe('2.4.9')
    expect(after.get(12)?.path).toBe('2.4.9.12')

    expect(after.get(4)?.depth).toBe(1)
    expect(after.get(12)?.depth).toBe(3)
    expect(after.get(4)?.parentId).toBe(2)
  })

  /*
   * The bug a `replace(path, '1.4', '2.4')` implementation ships with: forum 40
   * has path '1.40', which contains '1.4' as a string prefix but is a sibling,
   * not a descendant. It must not move.
   */
  it('leaves a prefix-sharing sibling alone', async () => {
    await repo.move(4, { newParentId: 2 })

    const after = await pathsById()
    expect(after.get(40)?.path).toBe('1.40')
    expect(after.get(40)?.parentId).toBe(1)
  })

  it('promotes a subtree to the root', async () => {
    await repo.move(9, { newParentId: null })

    const after = await pathsById()
    expect(after.get(9)?.path).toBe('9')
    expect(after.get(9)?.depth).toBe(0)
    expect(after.get(12)?.path).toBe('9.12')
    expect(after.get(12)?.depth).toBe(1)
  })

  it('renumbers siblings densely at the destination', async () => {
    await repo.move(4, { newParentId: null, position: 0 })

    const roots = (await repo.listAll()).filter((r) => r.parentId === null)
    expect(roots.sort((a, b) => a.displayOrder - b.displayOrder).map((r) => r.id)).toEqual([
      4, 1, 2,
    ])
  })

  it('refuses a cycle and leaves the tree untouched', async () => {
    const before = await pathsById()

    await expect(repo.move(4, { newParentId: 12 })).rejects.toThrow()

    // The rejection happens inside the transaction, so nothing may have landed.
    expect(await pathsById()).toEqual(before)
  })

  it('refuses a slug collision at the destination', async () => {
    await db.insert(forums).values({
      id: 50,
      type: 'forum',
      title: 'General clone',
      slug: 'general',
      parentId: 2,
      path: '2.50',
      depth: 1,
      displayOrder: 0,
    })

    await expect(repo.move(4, { newParentId: 2 })).rejects.toThrow()
    expect((await pathsById()).get(4)?.path).toBe('1.4')
  })
})

describe('schema guarantees', () => {
  it('rejects duplicate sibling slugs', async () => {
    await expect(
      db.insert(forums).values({
        id: 60,
        type: 'forum',
        title: 'Another general',
        slug: 'general',
        parentId: 1,
        path: '1.60',
        depth: 1,
        displayOrder: 5,
      }),
    ).rejects.toThrow()
  })

  it('allows the same slug under a different parent', async () => {
    await expect(
      db.insert(forums).values({
        id: 61,
        type: 'forum',
        title: 'General elsewhere',
        slug: 'general',
        parentId: 2,
        path: '2.61',
        depth: 1,
        displayOrder: 0,
      }),
    ).resolves.toBeDefined()
  })
})

describe('planMove over live rows', () => {
  it('plans from what the repository actually returns', async () => {
    const plan = planMove(await repo.listAll(), 9, { newParentId: 2 })
    expect(plan.pathUpdates.map((u) => u.path).sort()).toEqual(['2.9', '2.9.12'])
  })
})
