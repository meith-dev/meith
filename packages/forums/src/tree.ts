import type { ForumNode, TreeShaped } from './types'

function bySiblingOrder(a: TreeShaped, b: TreeShaped): number {
  return a.displayOrder - b.displayOrder || a.id - b.id
}

export function keepVisibleSubtrees<T extends TreeShaped>(
  rows: readonly T[],
  isVisible: (row: T) => boolean,
): T[] {
  const visible = rows.filter(isVisible)
  const survived = new Set(visible.map((row) => row.id))

  for (;;) {
    const orphaned = visible.filter(
      (row) => survived.has(row.id) && row.parentId !== null && !survived.has(row.parentId),
    )
    if (orphaned.length === 0) break
    for (const row of orphaned) survived.delete(row.id)
  }

  return visible.filter((row) => survived.has(row.id))
}

export function buildTree<T extends TreeShaped>(rows: readonly T[]): ForumNode<T>[] {
  const byId = new Map<number, T>(rows.map((row) => [row.id, row]))
  const childrenOf = new Map<number | null, T[]>()

  for (const row of rows) {
    const parentKey =
      row.parentId !== null && byId.has(row.parentId) && !isSelfOrCyclic(row, byId)
        ? row.parentId
        : null

    const bucket = childrenOf.get(parentKey)
    if (bucket) bucket.push(row)
    else childrenOf.set(parentKey, [row])
  }

  const attach = (row: T): ForumNode<T> => ({
    ...row,
    children: (childrenOf.get(row.id) ?? []).sort(bySiblingOrder).map(attach),
  })

  return (childrenOf.get(null) ?? []).sort(bySiblingOrder).map(attach)
}

function isSelfOrCyclic<T extends TreeShaped>(row: T, byId: Map<number, T>): boolean {
  const seen = new Set<number>([row.id])
  let current = row.parentId

  while (current !== null) {
    if (seen.has(current)) return true
    seen.add(current)
    const parent = byId.get(current)
    if (!parent) return false
    current = parent.parentId
  }
  return false
}

export function flattenTree<T extends TreeShaped>(
  nodes: readonly ForumNode<T>[],
): ForumNode<T>[] {
  const out: ForumNode<T>[] = []
  const visit = (node: ForumNode<T>): void => {
    out.push(node)
    for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return out
}
