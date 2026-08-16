import { canHoldForums } from './placement'
import { buildTree } from './tree'
import type { ForumNode, ForumRow, ForumType, MoveTarget } from './types'

export const NUDGES = ['up', 'down', 'in', 'out'] as const
export type Nudge = (typeof NUDGES)[number]

export interface ForumOutlineRow {
  readonly id: number
  readonly parentId: number | null
  readonly depth: number
  readonly type: ForumType
  readonly title: string
  readonly slug: string
}

export interface DropTarget {
  readonly parentId: number | null
  readonly afterId: number | null
}

export interface DropProjection extends DropTarget {
  readonly index: number
  readonly depth: number
}

export function isNudge(value: string): value is Nudge {
  return (NUDGES as readonly string[]).includes(value)
}

export function outlineOf(rows: readonly ForumRow[]): ForumOutlineRow[] {
  const outline: ForumOutlineRow[] = []

  const visit = (
    nodes: readonly ForumNode<ForumRow>[],
    parentId: number | null,
    depth: number,
  ): void => {
    for (const node of nodes) {
      outline.push({
        id: node.id,
        parentId,
        depth,
        type: node.type,
        title: node.title,
        slug: node.slug,
      })
      visit(node.children, node.id, depth + 1)
    }
  }

  visit(buildTree(rows), null, 0)
  return outline
}

export function subtreeOfOutline(
  outline: readonly ForumOutlineRow[],
  forumId: number,
): ForumOutlineRow[] {
  const start = outline.findIndex((row) => row.id === forumId)
  if (start === -1) return []

  const root = outline[start] as ForumOutlineRow
  let end = start + 1
  while (end < outline.length && (outline[end] as ForumOutlineRow).depth > root.depth)
    end += 1

  return outline.slice(start, end)
}

export function withoutSubtree(
  outline: readonly ForumOutlineRow[],
  forumId: number,
): ForumOutlineRow[] {
  const moving = new Set(subtreeOfOutline(outline, forumId).map((row) => row.id))
  return outline.filter((row) => !moving.has(row.id))
}

export function childrenOf(
  outline: readonly ForumOutlineRow[],
  parentId: number | null,
): ForumOutlineRow[] {
  return outline.filter((row) => row.parentId === parentId)
}

export function nudgeTarget(
  outline: readonly ForumOutlineRow[],
  forumId: number,
  nudge: Nudge,
): DropTarget | null {
  const row = outline.find((entry) => entry.id === forumId)
  if (row === undefined) return null

  const siblings = childrenOf(outline, row.parentId)
  const at = siblings.findIndex((entry) => entry.id === forumId)

  if (nudge === 'up') {
    if (at <= 0) return null
    return { parentId: row.parentId, afterId: siblings[at - 2]?.id ?? null }
  }

  if (nudge === 'down') {
    const next = siblings[at + 1]
    if (next === undefined) return null
    return { parentId: row.parentId, afterId: next.id }
  }

  if (nudge === 'in') {
    const previous = siblings[at - 1]
    if (previous === undefined || !canHoldForums(previous.type)) return null
    return {
      parentId: previous.id,
      afterId: childrenOf(outline, previous.id).at(-1)?.id ?? null,
    }
  }

  const parent = outline.find((entry) => entry.id === row.parentId)
  if (parent === undefined) return null
  return { parentId: parent.parentId, afterId: parent.id }
}

export function availableNudges(
  outline: readonly ForumOutlineRow[],
  forumId: number,
): Record<Nudge, boolean> {
  return {
    up: nudgeTarget(outline, forumId, 'up') !== null,
    down: nudgeTarget(outline, forumId, 'down') !== null,
    in: nudgeTarget(outline, forumId, 'in') !== null,
    out: nudgeTarget(outline, forumId, 'out') !== null,
  }
}

export function projectDrop(
  rows: readonly ForumOutlineRow[],
  index: number,
  depth: number,
): DropProjection {
  const at = Math.min(Math.max(index, 0), rows.length)
  const previous = rows[at - 1]
  const next = rows[at]

  if (previous === undefined)
    return { index: at, depth: 0, parentId: null, afterId: null }

  const deepest = canHoldForums(previous.type) ? previous.depth + 1 : previous.depth
  const shallowest = next?.depth ?? 0
  const settled = Math.min(Math.max(depth, shallowest), deepest)

  if (settled === previous.depth + 1) {
    return { index: at, depth: settled, parentId: previous.id, afterId: null }
  }

  for (let cursor = at - 1; cursor >= 0; cursor -= 1) {
    const candidate = rows[cursor] as ForumOutlineRow
    if (candidate.depth === settled) {
      return {
        index: at,
        depth: settled,
        parentId: candidate.parentId,
        afterId: candidate.id,
      }
    }
  }

  return { index: at, depth: 0, parentId: null, afterId: null }
}

export function projectionOf(
  outline: readonly ForumOutlineRow[],
  forumId: number,
  target: DropTarget,
): DropProjection {
  const rows = withoutSubtree(outline, forumId)
  const parent = rows.find((row) => row.id === target.parentId)
  const depth = target.parentId === null ? 0 : (parent?.depth ?? 0) + 1

  if (target.afterId === null) {
    const index = parent === undefined ? 0 : rows.indexOf(parent) + 1
    return { ...target, index, depth }
  }

  const after = rows.find((row) => row.id === target.afterId)
  if (after === undefined) return { ...target, index: rows.length, depth }

  const followers = subtreeOfOutline(rows, after.id)
  return { ...target, index: rows.indexOf(after) + followers.length, depth }
}

export function applyDrop(
  outline: readonly ForumOutlineRow[],
  forumId: number,
  projection: DropProjection,
): ForumOutlineRow[] {
  const block = subtreeOfOutline(outline, forumId)
  if (block.length === 0) return [...outline]

  const rest = withoutSubtree(outline, forumId)
  const shift = projection.depth - (block[0] as ForumOutlineRow).depth

  const moved = block.map((row, offset) => ({
    ...row,
    depth: row.depth + shift,
    ...(offset === 0 ? { parentId: projection.parentId } : {}),
  }))

  return [...rest.slice(0, projection.index), ...moved, ...rest.slice(projection.index)]
}

export function isWhereItIs(
  outline: readonly ForumOutlineRow[],
  forumId: number,
  target: DropTarget,
): boolean {
  const row = outline.find((entry) => entry.id === forumId)
  if (row === undefined || row.parentId !== target.parentId) return false

  const siblings = childrenOf(outline, row.parentId)
  const at = siblings.findIndex((entry) => entry.id === forumId)

  return (siblings[at - 1]?.id ?? null) === target.afterId
}

export function moveTargetOf(target: DropTarget): MoveTarget {
  return { newParentId: target.parentId, after: target.afterId }
}
