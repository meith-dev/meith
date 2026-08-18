import { describe, expect, it } from 'vitest'

import {
  applyDrop,
  availableNudges,
  depthAllowedFor,
  hasChildren,
  isNavigationNudge,
  isWhereItIs,
  type NavigationOutlineRow,
  nudgeTarget,
  projectDrop,
  projectionOf,
  subtreeOf,
  withoutSubtree,
} from './navigation-arrange'

function outline(
  shape: readonly (readonly [number, number | null])[],
): readonly NavigationOutlineRow[] {
  return shape.map(([id, parentId]) => ({ id, parentId, depth: parentId === null ? 0 : 1 }))
}

const FLAT = outline([
  [1, null],
  [2, null],
  [3, null],
])

const NESTED = outline([
  [1, null],
  [2, 1],
  [3, 1],
  [4, null],
])

describe('reading the shape', () => {
  it('takes an item and everything under it as one block', () => {
    expect(subtreeOf(NESTED, 1).map((row) => row.id)).toEqual([1, 2, 3])
    expect(subtreeOf(NESTED, 2).map((row) => row.id)).toEqual([2])
  })

  it('lifts that block out when asked what is left', () => {
    expect(withoutSubtree(NESTED, 1).map((row) => row.id)).toEqual([4])
  })

  it('knows which items have something under them', () => {
    expect(hasChildren(NESTED, 1)).toBe(true)
    expect(hasChildren(NESTED, 4)).toBe(false)
  })

  it('refuses to let an item with children go a level down', () => {
    expect(depthAllowedFor(NESTED, 1)).toBe(0)
    expect(depthAllowedFor(NESTED, 4)).toBe(1)
  })

  it('recognises a direction and nothing else', () => {
    expect(isNavigationNudge('in')).toBe(true)
    expect(isNavigationNudge('sideways')).toBe(false)
  })
})

describe('nudging', () => {
  it('moves an item up past its previous sibling', () => {
    expect(nudgeTarget(FLAT, 3, 'up')).toEqual({ parentId: null, afterId: 1 })
  })

  it('sends the first item nowhere', () => {
    expect(nudgeTarget(FLAT, 1, 'up')).toBeNull()
    expect(nudgeTarget(FLAT, 3, 'down')).toBeNull()
  })

  it('moves an item down past the one after it', () => {
    expect(nudgeTarget(FLAT, 1, 'down')).toEqual({ parentId: null, afterId: 2 })
  })

  it('tucks an item under the sibling above it, last in that submenu', () => {
    expect(nudgeTarget(NESTED, 4, 'in')).toEqual({ parentId: 1, afterId: 3 })
  })

  it('refuses to nest an item that has children of its own', () => {
    const twoParents = outline([
      [1, null],
      [2, 1],
      [3, null],
      [4, 3],
    ])

    expect(nudgeTarget(twoParents, 3, 'in')).toBeNull()
  })

  it('refuses a second level', () => {
    expect(nudgeTarget(NESTED, 3, 'in')).toBeNull()
  })

  it('lifts a child back out, straight after its parent', () => {
    expect(nudgeTarget(NESTED, 2, 'out')).toEqual({ parentId: null, afterId: 1 })
  })

  it('has nowhere to lift a top-level item to', () => {
    expect(nudgeTarget(FLAT, 2, 'out')).toBeNull()
  })

  it('reports what is available so the buttons can be disabled', () => {
    expect(availableNudges(FLAT, 1)).toEqual({ up: false, down: true, in: false, out: false })
    expect(availableNudges(NESTED, 2)).toEqual({ up: false, down: true, in: false, out: true })
  })
})

describe('projecting a drop', () => {
  it('puts a drop above everything at the top level', () => {
    expect(projectDrop(FLAT, 0, 1)).toEqual({ index: 0, depth: 0, parentId: null, afterId: null })
  })

  it('nests when the pointer is dragged to the right of a top-level item', () => {
    expect(projectDrop(FLAT, 1, 1)).toEqual({ index: 1, depth: 1, parentId: 1, afterId: null })
  })

  it('joins the submenu it is dropped into rather than starting a second level', () => {
    const rest = outline([
      [1, null],
      [2, 1],
    ])

    expect(projectDrop(rest, 2, 2)).toEqual({ index: 2, depth: 1, parentId: 1, afterId: 2 })
  })

  it('refuses to nest a block that carries children', () => {
    expect(projectDrop(FLAT, 1, 1, 0)).toEqual({
      index: 1,
      depth: 0,
      parentId: null,
      afterId: 1,
    })
  })

  it('lands after the top-level ancestor when dragged back to the left', () => {
    const rest = outline([
      [1, null],
      [2, 1],
    ])

    expect(projectDrop(rest, 2, 0)).toEqual({ index: 2, depth: 0, parentId: null, afterId: 1 })
  })

  it('turns a target back into a position in the list', () => {
    expect(projectionOf(NESTED, 4, { parentId: 1, afterId: 2 })).toEqual({
      index: 2,
      depth: 1,
      parentId: 1,
      afterId: 2,
    })
  })
})

describe('applying a drop', () => {
  it('carries the children along and re-hangs the block', () => {
    const moved = applyDrop(NESTED, 1, { index: 1, depth: 0, parentId: null, afterId: 4 })

    expect(moved.map((row) => [row.id, row.depth, row.parentId])).toEqual([
      [4, 0, null],
      [1, 0, null],
      [2, 1, 1],
      [3, 1, 1],
    ])
  })

  it('re-parents the item it moved and nothing else', () => {
    const moved = applyDrop(NESTED, 4, { index: 1, depth: 1, parentId: 1, afterId: null })

    expect(moved.find((row) => row.id === 4)).toEqual({ id: 4, parentId: 1, depth: 1 })
  })

  it('leaves the outline alone when the item is not in it', () => {
    expect(applyDrop(FLAT, 99, { index: 0, depth: 0, parentId: null, afterId: null })).toEqual(FLAT)
  })
})

describe('knowing when nothing moved', () => {
  it('spots a drop onto the position the item already holds', () => {
    expect(isWhereItIs(FLAT, 2, { parentId: null, afterId: 1 })).toBe(true)
    expect(isWhereItIs(FLAT, 2, { parentId: null, afterId: 3 })).toBe(false)
  })

  it('counts a first-in-the-list item as unmoved when dropped first', () => {
    expect(isWhereItIs(NESTED, 2, { parentId: 1, afterId: null })).toBe(true)
  })
})
