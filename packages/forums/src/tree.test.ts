import { describe, expect, it } from 'vitest'

import { ancestorIds, childPath, depthOf, isInSubtree, parsePath, rehang } from './path'
import { buildTree, flattenTree } from './tree'
import type { ForumRow } from './types'

function row(
  id: number,
  parentId: number | null,
  displayOrder = 0,
  path = String(id),
): ForumRow {
  return {
    id,
    parentId,
    displayOrder,
    path,
    depth: path.split('.').length - 1,
    type: 'forum',
    title: `F${id}`,
    slug: `f-${id}`,
    description: null,
    linkUrl: null,
  }
}

describe('path arithmetic', () => {
  it('parses and formats round-trip', () => {
    expect(parsePath('1.4.9')).toEqual([1, 4, 9])
    expect(ancestorIds('1.4.9')).toEqual([1, 4])
    expect(ancestorIds('1')).toEqual([])
    expect(depthOf('1')).toBe(0)
    expect(depthOf('1.4.9')).toBe(2)
  })

  it('builds child paths from a root or a parent', () => {
    expect(childPath(null, 7)).toBe('7')
    expect(childPath('1.4', 9)).toBe('1.4.9')
  })

  it('rejects a malformed path rather than silently coercing', () => {
    expect(() => parsePath('1.x.9')).toThrow()
    expect(() => parsePath('1.-2')).toThrow()
  })

  /* The distinction the whole subtree predicate rests on. */
  it('treats a shared numeric prefix as a different branch', () => {
    expect(isInSubtree('1.4', '1.4')).toBe(true)
    expect(isInSubtree('1.4.9', '1.4')).toBe(true)
    expect(isInSubtree('1.40', '1.4')).toBe(false)
  })

  it('rehangs a descendant onto a new root', () => {
    expect(rehang('1.4.9.12', '1.4', '2.4')).toBe('2.4.9.12')
    expect(rehang('1.4', '1.4', '9')).toBe('9')
    expect(() => rehang('1.40', '1.4', '2')).toThrow()
  })
})

describe('buildTree', () => {
  it('nests children under parents', () => {
    const tree = buildTree([row(1, null), row(4, 1, 0, '1.4'), row(9, 4, 0, '1.4.9')])
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children[0]?.id).toBe(4)
    expect(tree[0]?.children[0]?.children[0]?.id).toBe(9)
  })

  it('orders siblings by display order, then id', () => {
    const tree = buildTree([row(3, null, 1), row(1, null, 0), row(2, null, 0)])
    // Equal display_order falls back to id so the order is stable across runs.
    expect(tree.map((n) => n.id)).toEqual([1, 2, 3])
  })

  it('promotes an orphan to the root rather than dropping it', () => {
    // Routine once F21 filters by visibility: a visible child of a hidden parent.
    const tree = buildTree([row(1, null), row(9, 77, 0, '77.9')])
    expect(tree.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 9])
  })

  it('does not hang on a cycle', () => {
    // Corrupt data must not spin the render thread.
    const tree = buildTree([row(1, 2), row(2, 1)])
    expect(flattenTree(tree)).toHaveLength(2)
  })

  it('flattens depth-first, parents before children', () => {
    const tree = buildTree([row(1, null), row(4, 1, 0, '1.4'), row(2, null, 1)])
    expect(flattenTree(tree).map((n) => n.id)).toEqual([1, 4, 2])
  })
})
