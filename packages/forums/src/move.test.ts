import { ConflictError, ValidationError } from '@meith/core'
import { describe, expect, it } from 'vitest'

import { planMove } from './move'
import { buildTree, flattenTree } from './tree'
import type { ForumRow } from './types'

function forum(
  id: number,
  parentId: number | null,
  path: string,
  over: Partial<ForumRow> = {},
): ForumRow {
  return {
    id,
    parentId,
    path,
    depth: path.split('.').length - 1,
    displayOrder: 0,
    type: 'forum',
    title: `Forum ${id}`,
    slug: `forum-${id}`,
    description: null,
    linkUrl: null,
    ...over,
  }
}

const TREE: ForumRow[] = [
  forum(1, null, '1', { type: 'category', slug: 'cat-one', displayOrder: 0 }),
  forum(2, null, '2', { type: 'category', slug: 'cat-two', displayOrder: 1 }),
  forum(4, 1, '1.4', { slug: 'general' }),
  forum(9, 4, '1.4.9', { slug: 'off-topic' }),
  forum(12, 9, '1.4.9.12', { slug: 'deep' }),
]

describe('planMove — reparenting', () => {
  it('rewrites every descendant path, not just direct children', () => {
    const plan = planMove(TREE, 4, { newParentId: 2 })
    const paths = new Map(plan.pathUpdates.map((u) => [u.id, u.path]))

    expect(paths.get(4)).toBe('2.4')
    expect(paths.get(9)).toBe('2.4.9')
    expect(paths.get(12)).toBe('2.4.9.12')
    expect(plan.pathUpdates).toHaveLength(3)
  })

  it('recomputes depth alongside path', () => {
    const plan = planMove(TREE, 9, { newParentId: null })
    const depths = new Map(plan.pathUpdates.map((u) => [u.id, u.depth]))

    expect(depths.get(9)).toBe(0)
    expect(depths.get(12)).toBe(1)
  })

  it('promotes a subtree to the root', () => {
    const plan = planMove(TREE, 9, { newParentId: null })
    const paths = new Map(plan.pathUpdates.map((u) => [u.id, u.path]))

    expect(paths.get(9)).toBe('9')
    expect(paths.get(12)).toBe('9.12')
  })

  it('leaves paths untouched when only the position changes', () => {
    const plan = planMove(TREE, 4, { newParentId: 1, position: 0 })
    expect(plan.pathUpdates).toEqual([])
  })
})

describe('planMove — rejections', () => {
  it('refuses to move a forum into its own descendant', () => {
    expect(() => planMove(TREE, 4, { newParentId: 12 })).toThrow(ValidationError)
  })

  it('refuses to move a forum into itself', () => {
    expect(() => planMove(TREE, 4, { newParentId: 4 })).toThrow(ValidationError)
  })

  it('refuses to nest under a link, which holds nothing', () => {
    const rows = [...TREE, forum(20, null, '20', { type: 'link', slug: 'rules' })]
    expect(() => planMove(rows, 4, { newParentId: 20 })).toThrow(ValidationError)
  })

  it('refuses a slug collision at the destination', () => {
    const rows = [...TREE, forum(30, 2, '2.30', { slug: 'general' })]
    expect(() => planMove(rows, 4, { newParentId: 2 })).toThrow(ConflictError)
  })

  it('rejects an unknown forum or destination', () => {
    expect(() => planMove(TREE, 999, { newParentId: 1 })).toThrow(ValidationError)
    expect(() => planMove(TREE, 4, { newParentId: 999 })).toThrow(ValidationError)
  })

  it('does not confuse a sibling whose id shares a prefix', () => {
    const rows = [...TREE, forum(40, 1, '1.40', { slug: 'forty' })]

    const plan = planMove(rows, 4, { newParentId: 2 })
    expect(plan.pathUpdates.map((u) => u.id)).not.toContain(40)

    expect(() => planMove(rows, 4, { newParentId: 40 })).not.toThrow()
  })
})

describe('planMove — sibling ordering', () => {
  it('appends when no position is given', () => {
    const plan = planMove(TREE, 4, { newParentId: null })
    const order = plan.orderUpdates.find((o) => o.id === 4)
    expect(order?.displayOrder).toBe(2)
  })

  it('inserts at the requested position and renumbers densely', () => {
    const plan = planMove(TREE, 4, { newParentId: null, position: 0 })
    expect(plan.orderUpdates).toEqual([
      { id: 4, displayOrder: 0 },
      { id: 1, displayOrder: 1 },
      { id: 2, displayOrder: 2 },
    ])
  })

  it('clamps a position past the end instead of erroring', () => {
    const plan = planMove(TREE, 4, { newParentId: null, position: 99 })
    expect(plan.orderUpdates.find((o) => o.id === 4)?.displayOrder).toBe(2)
  })

  it('puts a forum directly after the sibling it was dropped onto', () => {
    const plan = planMove(TREE, 4, { newParentId: null, after: 1 })
    expect(plan.orderUpdates).toEqual([
      { id: 1, displayOrder: 0 },
      { id: 4, displayOrder: 1 },
      { id: 2, displayOrder: 2 },
    ])
  })

  it('puts a forum first when it follows nothing', () => {
    const plan = planMove(TREE, 4, { newParentId: null, after: null })
    expect(plan.orderUpdates.find((o) => o.id === 4)?.displayOrder).toBe(0)
  })

  it('refuses an anchor that is no longer a sibling, rather than guessing', () => {
    expect(() => planMove(TREE, 4, { newParentId: null, after: 9 })).toThrow(ConflictError)
  })
})

describe('applying a plan keeps the tree walkable', () => {
  it('rebuilds correctly from the rewritten rows', () => {
    const plan = planMove(TREE, 4, { newParentId: 2 })
    const paths = new Map(plan.pathUpdates.map((u) => [u.id, u.path]))

    const moved = TREE.map((row) =>
      paths.has(row.id)
        ? { ...row, path: paths.get(row.id) as string, parentId: row.id === 4 ? 2 : row.parentId }
        : row,
    )

    const ids = flattenTree(buildTree(moved)).map((n) => n.id)
    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2, 4, 9, 12])

    const catTwo = buildTree(moved).find((n) => n.id === 2)
    expect(catTwo?.children.map((c) => c.id)).toEqual([4])
  })
})
