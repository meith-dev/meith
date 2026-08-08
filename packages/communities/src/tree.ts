/**
 * Flat rows → ordered tree, in one pass (F16).
 *
 * The repository fetches every community in a single query — the tree is small and
 * bounded (tens of rows, not thousands) — and this assembles it in memory. That
 * is what "tree read is one query regardless of depth" means: depth costs
 * nothing here because no query is issued per level.
 */
import type { CommunityNode, TreeShaped } from './types'

/**
 * Sibling order: `display_order`, then id as a stable tiebreak.
 *
 * The tiebreak matters — two communities sharing a display_order (easy to produce by
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
/**
 * Drop whole subtrees whose parent the viewer cannot see.
 *
 * `buildTree` promotes an orphan to a root, which is correct for a genuinely
 * orphaned row and **a visibility leak** for one whose parent was filtered out:
 * a hidden category's children would surface as top-level blocks, announcing
 * both that they exist and what they are called, and making the board's shape
 * depend on who is looking (D38).
 *
 * So a subtree is dropped *whole*, and the drop is iterated to a fixed point —
 * a grandchild whose parent went for this reason has to go too, and a single
 * pass would keep it.
 *
 * This lives here, beside `buildTree`, because it is the correction to
 * `buildTree`'s behaviour and because two callers need it. It was inlined in the
 * board index first; the community jump box (F27) is the second, and a
 * security-relevant filter implemented twice is one that will be fixed once.
 */
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

export function buildTree<T extends TreeShaped>(rows: readonly T[]): CommunityNode<T>[] {
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

  const attach = (row: T): CommunityNode<T> => ({
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
  nodes: readonly CommunityNode<T>[],
): CommunityNode<T>[] {
  const out: CommunityNode<T>[] = []
  const visit = (node: CommunityNode<T>): void => {
    out.push(node)
    for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return out
}
