export const NAVIGATION_NUDGES = ['up', 'down', 'in', 'out'] as const

export type NavigationNudge = (typeof NAVIGATION_NUDGES)[number]

export const NAVIGATION_MAX_DEPTH = 1

export interface NavigationOutlineRow {
  readonly id: number
  readonly parentId: number | null
  readonly depth: number
}

export interface NavigationDropTarget {
  readonly parentId: number | null
  readonly afterId: number | null
}

export interface NavigationDropProjection extends NavigationDropTarget {
  readonly index: number
  readonly depth: number
}

export function isNavigationNudge(value: string): value is NavigationNudge {
  return (NAVIGATION_NUDGES as readonly string[]).includes(value)
}

export function childrenOf<T extends NavigationOutlineRow>(
  outline: readonly T[],
  parentId: number | null,
): T[] {
  return outline.filter((row) => row.parentId === parentId)
}

export function hasChildren(outline: readonly NavigationOutlineRow[], id: number): boolean {
  return outline.some((row) => row.parentId === id)
}

export function subtreeOf<T extends NavigationOutlineRow>(outline: readonly T[], id: number): T[] {
  const start = outline.findIndex((row) => row.id === id)
  if (start === -1) return []

  const root = outline[start] as T
  let end = start + 1
  while (end < outline.length && (outline[end] as T).depth > root.depth) end += 1

  return outline.slice(start, end)
}

export function withoutSubtree<T extends NavigationOutlineRow>(
  outline: readonly T[],
  id: number,
): T[] {
  const moving = new Set(subtreeOf(outline, id).map((row) => row.id))
  return outline.filter((row) => !moving.has(row.id))
}

export function depthAllowedFor(outline: readonly NavigationOutlineRow[], id: number): number {
  return hasChildren(outline, id) ? 0 : NAVIGATION_MAX_DEPTH
}

export function nudgeTarget(
  outline: readonly NavigationOutlineRow[],
  id: number,
  nudge: NavigationNudge,
): NavigationDropTarget | null {
  const row = outline.find((entry) => entry.id === id)
  if (row === undefined) return null

  const siblings = childrenOf(outline, row.parentId)
  const at = siblings.findIndex((entry) => entry.id === id)

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
    if (previous === undefined || previous.depth >= NAVIGATION_MAX_DEPTH) return null
    if (hasChildren(outline, id)) return null
    return { parentId: previous.id, afterId: childrenOf(outline, previous.id).at(-1)?.id ?? null }
  }

  if (row.parentId === null) return null
  return { parentId: null, afterId: row.parentId }
}

export function availableNudges(
  outline: readonly NavigationOutlineRow[],
  id: number,
): Record<NavigationNudge, boolean> {
  return {
    up: nudgeTarget(outline, id, 'up') !== null,
    down: nudgeTarget(outline, id, 'down') !== null,
    in: nudgeTarget(outline, id, 'in') !== null,
    out: nudgeTarget(outline, id, 'out') !== null,
  }
}

export function projectDrop(
  rows: readonly NavigationOutlineRow[],
  index: number,
  depth: number,
  maxDepth: number = NAVIGATION_MAX_DEPTH,
): NavigationDropProjection {
  const at = Math.min(Math.max(index, 0), rows.length)
  const previous = rows[at - 1]
  const next = rows[at]

  if (previous === undefined) return { index: at, depth: 0, parentId: null, afterId: null }

  const deepest = Math.min(NAVIGATION_MAX_DEPTH, maxDepth)
  const shallowest = Math.min(next?.depth ?? 0, deepest)
  const settled = Math.min(Math.max(depth, shallowest), deepest)

  if (settled > 0) {
    return previous.depth === 0
      ? { index: at, depth: settled, parentId: previous.id, afterId: null }
      : { index: at, depth: settled, parentId: previous.parentId, afterId: previous.id }
  }

  for (let cursor = at - 1; cursor >= 0; cursor -= 1) {
    const candidate = rows[cursor] as NavigationOutlineRow
    if (candidate.depth === 0) return { index: at, depth: 0, parentId: null, afterId: candidate.id }
  }

  return { index: at, depth: 0, parentId: null, afterId: null }
}

export function projectionOf(
  outline: readonly NavigationOutlineRow[],
  id: number,
  target: NavigationDropTarget,
): NavigationDropProjection {
  const rows = withoutSubtree(outline, id)
  const parent = rows.find((row) => row.id === target.parentId)
  const depth = target.parentId === null ? 0 : (parent?.depth ?? 0) + 1

  if (target.afterId === null) {
    const index = parent === undefined ? 0 : rows.indexOf(parent) + 1
    return { ...target, index, depth }
  }

  const after = rows.find((row) => row.id === target.afterId)
  if (after === undefined) return { ...target, index: rows.length, depth }

  return { ...target, index: rows.indexOf(after) + subtreeOf(rows, after.id).length, depth }
}

export function applyDrop<T extends NavigationOutlineRow>(
  outline: readonly T[],
  id: number,
  projection: NavigationDropProjection,
): T[] {
  const block = subtreeOf(outline, id)
  if (block.length === 0) return [...outline]

  const rest = withoutSubtree(outline, id)
  const shift = projection.depth - (block[0] as T).depth

  const moved = block.map((row, offset) => ({
    ...row,
    depth: row.depth + shift,
    ...(offset === 0 ? { parentId: projection.parentId } : {}),
  }))

  return [...rest.slice(0, projection.index), ...moved, ...rest.slice(projection.index)]
}

export function isWhereItIs(
  outline: readonly NavigationOutlineRow[],
  id: number,
  target: NavigationDropTarget,
): boolean {
  const row = outline.find((entry) => entry.id === id)
  if (row === undefined || row.parentId !== target.parentId) return false

  const siblings = childrenOf(outline, row.parentId)
  const at = siblings.findIndex((entry) => entry.id === id)

  return (siblings[at - 1]?.id ?? null) === target.afterId
}
