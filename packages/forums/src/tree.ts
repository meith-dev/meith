/**
 * Flat rows → ordered tree, in one pass (F16).
 *
 * The repository fetches every forum in a single query — the tree is small and
 * bounded (tens of rows, not thousands) — and this assembles it in memory. That
 * is what "tree read is one query regardless of depth" means: depth costs
 * nothing here because no query is issued per level.
 */
import type { ForumNode, TreeShaped } from './types'

/**
 * Sibling order: `display_order`, then id as a stable tiebreak.
 *
 * The tiebreak matters — two forums sharing a display_order (easy to produce by
 * hand, or by an import) would otherwise render in whatever order the database
 * happened to return, which changes between runs and makes pagination and
 * snapshot tests flap.
 */
function bySiblingOrder(a: TreeShaped, b: TreeShaped): number {
  return a.displayOrder - b.displayOrder || a.id - b.id
}

/**
 * Assemble `rows` into a forest.
 *
 * **Orphans are promoted to roots, not dropped.** A row whose `parentId` is not
 * in `rows` happens routinely once F21 filters the input by visibility: a child
 * the actor may view can outlive a parent they may not. Silently discarding it
 * would make a permission grant disappear with no trace, so it surfaces at the
 * top level instead. Callers wanting strict containment should filter parents
 * and children together.
 *
 * A row whose ancestry contains a cycle is also treated as a root rather than
 * recursed into; the database prevents cycles (see `planMove`), but this
 * function must not hang on corrupt data.
 */
export function buildTree<T extends TreeShaped>(rows: readonly T[]): ForumNode<T>[] {
  const byId = new Map<number, T>(rows.map((row) => [row.id, row]))
  const childrenOf = new Map<number | null, T[]>()

  for (const row of rows) {
    // Treat a parent that is absent from this set as no parent at all.
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

/** Walk up from `row`; report whether it reaches itself (or loops forever). */
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

/** Depth-first flatten, parents before children — index render order. */
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
