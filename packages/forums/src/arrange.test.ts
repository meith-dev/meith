import { describe, expect, it } from 'vitest'

import {
  applyDrop,
  availableNudges,
  isWhereItIs,
  nudgeTarget,
  outlineOf,
  projectDrop,
  projectionOf,
  subtreeOfOutline,
  withoutSubtree,
} from './arrange'
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
  forum(1, null, '1', { type: 'category', title: 'Main', displayOrder: 0 }),
  forum(2, 1, '1.2', { title: 'General', displayOrder: 0 }),
  forum(3, 2, '1.2.3', { title: 'Off Topic', displayOrder: 0 }),
  forum(4, 1, '1.4', { title: 'Support', displayOrder: 1 }),
  forum(5, null, '5', { type: 'category', title: 'Staff', displayOrder: 1 }),
  forum(6, null, '6', { type: 'link', title: 'Docs', displayOrder: 2 }),
]

const OUTLINE = outlineOf(TREE)

function shape(rows: ReturnType<typeof outlineOf>): string[] {
  return rows.map((row) => `${'  '.repeat(row.depth)}${row.title}`)
}

describe('outlineOf', () => {
  it('reads out the tree in the order it renders, with depth', () => {
    expect(shape(OUTLINE)).toEqual([
      'Main',
      '  General',
      '    Off Topic',
      '  Support',
      'Staff',
      'Docs',
    ])
  })

  it('carries the parent each row hangs from', () => {
    expect(OUTLINE.map((row) => [row.title, row.parentId])).toEqual([
      ['Main', null],
      ['General', 1],
      ['Off Topic', 2],
      ['Support', 1],
      ['Staff', null],
      ['Docs', null],
    ])
  })
})

describe('subtrees', () => {
  it('takes the descendants with the forum', () => {
    expect(subtreeOfOutline(OUTLINE, 2).map((row) => row.id)).toEqual([2, 3])
  })

  it('lifts a whole subtree out of the list', () => {
    expect(withoutSubtree(OUTLINE, 1).map((row) => row.id)).toEqual([5, 6])
  })
})

describe('nudgeTarget', () => {
  it('puts a forum before the sibling above it', () => {
    expect(nudgeTarget(OUTLINE, 4, 'up')).toEqual({ parentId: 1, afterId: null })
  })

  it('puts a forum after the sibling below it', () => {
    expect(nudgeTarget(OUTLINE, 2, 'down')).toEqual({ parentId: 1, afterId: 4 })
  })

  it('refuses to move the first sibling up or the last one down', () => {
    expect(nudgeTarget(OUTLINE, 2, 'up')).toBeNull()
    expect(nudgeTarget(OUTLINE, 4, 'down')).toBeNull()
  })

  it('nests a forum under the sibling above it, at the end of its children', () => {
    expect(nudgeTarget(OUTLINE, 4, 'in')).toEqual({ parentId: 2, afterId: 3 })
  })

  it('will not nest anything inside a link', () => {
    const withLinkAbove = outlineOf([
      ...TREE,
      forum(7, null, '7', { title: 'After the link', displayOrder: 3 }),
    ])
    expect(nudgeTarget(withLinkAbove, 7, 'in')).toBeNull()
  })

  it('lifts a forum out to sit just after its old parent', () => {
    expect(nudgeTarget(OUTLINE, 3, 'out')).toEqual({ parentId: 1, afterId: 2 })
  })

  it('has nowhere further out to go at the root', () => {
    expect(nudgeTarget(OUTLINE, 5, 'out')).toBeNull()
  })

  it('reports which nudges a row actually has', () => {
    expect(availableNudges(OUTLINE, 2)).toEqual({
      up: false,
      down: true,
      in: false,
      out: true,
    })
    expect(availableNudges(OUTLINE, 5)).toEqual({
      up: true,
      down: true,
      in: true,
      out: false,
    })
  })
})

describe('projectDrop', () => {
  const rows = withoutSubtree(OUTLINE, 4)

  it('drops at the root when it lands above everything', () => {
    expect(projectDrop(rows, 0, 3)).toEqual({
      index: 0,
      depth: 0,
      parentId: null,
      afterId: null,
    })
  })

  it('nests one level deeper than the row above when dragged right', () => {
    expect(projectDrop(rows, 2, 9)).toEqual({
      index: 2,
      depth: 2,
      parentId: 2,
      afterId: null,
    })
  })

  it('follows the row above at the same depth', () => {
    expect(projectDrop(rows, 3, 1)).toEqual({
      index: 3,
      depth: 1,
      parentId: 1,
      afterId: 2,
    })
  })

  it('cannot rise above the row below, which would orphan it', () => {
    expect(projectDrop(rows, 2, 0).depth).toBe(2)
  })

  it('cannot nest inside a link', () => {
    const projected = projectDrop(rows, rows.length, 4)
    expect(projected.depth).toBe(0)
    expect(projected.parentId).toBeNull()
  })
})

describe('projectionOf', () => {
  it('places a row after the whole subtree of the sibling it follows', () => {
    const projection = projectionOf(OUTLINE, 4, { parentId: 1, afterId: 2 })
    expect(projection).toEqual({ parentId: 1, afterId: 2, index: 3, depth: 1 })
  })

  it('places a first child directly under its parent', () => {
    expect(projectionOf(OUTLINE, 4, { parentId: 5, afterId: null })).toEqual({
      parentId: 5,
      afterId: null,
      index: 4,
      depth: 1,
    })
  })
})

describe('applyDrop', () => {
  it('moves the forum and its descendants together', () => {
    const moved = applyDrop(
      OUTLINE,
      2,
      projectionOf(OUTLINE, 2, { parentId: 5, afterId: null }),
    )

    expect(shape(moved)).toEqual([
      'Main',
      '  Support',
      'Staff',
      '  General',
      '    Off Topic',
      'Docs',
    ])
  })

  it('re-hangs the moved row on its new parent', () => {
    const moved = applyDrop(
      OUTLINE,
      3,
      projectionOf(OUTLINE, 3, { parentId: null, afterId: 5 }),
    )
    expect(moved.find((row) => row.id === 3)).toMatchObject({ parentId: null, depth: 0 })
  })
})

describe('isWhereItIs', () => {
  it('knows a drop that changes nothing', () => {
    expect(isWhereItIs(OUTLINE, 4, { parentId: 1, afterId: 2 })).toBe(true)
    expect(isWhereItIs(OUTLINE, 2, { parentId: 1, afterId: null })).toBe(true)
  })

  it('knows a drop that does change something', () => {
    expect(isWhereItIs(OUTLINE, 4, { parentId: 1, afterId: null })).toBe(false)
    expect(isWhereItIs(OUTLINE, 4, { parentId: 5, afterId: null })).toBe(false)
  })
})
