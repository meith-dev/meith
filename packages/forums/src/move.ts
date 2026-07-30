/**
 * Reparent and reorder (F16).
 *
 * This is the operation the plan singles out as dangerous: "reordering and
 * reparenting must update every descendant's `path` in one transaction".
 *
 * The planning is pure and lives here so the whole failure surface — cycles,
 * slug collisions, sibling renumbering, descendant rewrites — is testable
 * without a database. The repository's only job is to apply the returned plan
 * atomically.
 */
import { ConflictError, ValidationError } from '@forum/core'

import { childPath, depthOf, isInSubtree, rehang } from './path'
import type { ForumRow, MovePlan, MoveTarget, PathUpdate } from './types'

/**
 * Validate a move and compute its full effect.
 *
 * `rows` must be the complete forum set: the plan rewrites descendants, so a
 * partial set would silently leave some of them pointing at the old path.
 */
export function planMove(
  rows: readonly ForumRow[],
  forumId: number,
  target: MoveTarget,
): MovePlan {
  const byId = new Map(rows.map((r) => [r.id, r]))

  const forum = byId.get(forumId)
  if (!forum) throw new ValidationError(`No such forum: ${forumId}`)

  const { newParentId } = target
  const newParent = newParentId === null ? null : byId.get(newParentId)
  if (newParentId !== null && !newParent) {
    throw new ValidationError(`No such parent forum: ${newParentId}`)
  }

  if (newParent) {
    if (newParent.id === forum.id) {
      throw new ValidationError('A forum cannot be its own parent.')
    }

    /*
     * The cycle guard. Moving a forum *into its own subtree* would detach that
     * whole branch from the root and leave a ring of paths pointing at each
     * other — unreachable from the index and impossible to repair through the
     * ACP, since every screen navigates from the root down.
     */
    if (isInSubtree(newParent.path, forum.path)) {
      throw new ValidationError(
        `Cannot move "${forum.title}" into its own descendant "${newParent.title}".`,
      )
    }

    // A link is a navigation stub, not a container.
    if (newParent.type === 'link') {
      throw new ValidationError(
        `"${newParent.title}" is a link and cannot contain forums.`,
      )
    }
  }

  const siblings = rows
    .filter((r) => r.parentId === newParentId && r.id !== forum.id)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)

  /*
   * Checked here rather than left to the unique index so the ACP gets "a forum
   * called X already exists here" instead of a raw constraint violation. The
   * index still backs it up — this is the message, not the guarantee.
   */
  const collision = siblings.find((s) => s.slug === forum.slug)
  if (collision) {
    throw new ConflictError(
      `A forum with the slug "${forum.slug}" already exists in that location.`,
    )
  }

  return {
    forumId,
    newParentId,
    pathUpdates: planPathUpdates(rows, forum, newParent?.path ?? null),
    orderUpdates: planOrderUpdates(siblings, forum.id, target.position),
  }
}

/**
 * The moved forum's new path plus every descendant's, re-hung onto the new root.
 *
 * Every descendant is rewritten, not just direct children — that is the whole
 * point of the materialised path, and the thing a naive implementation misses.
 */
function planPathUpdates(
  rows: readonly ForumRow[],
  forum: ForumRow,
  newParentPath: string | null,
): PathUpdate[] {
  const newRoot = childPath(newParentPath, forum.id)

  // Already where it is being asked to go: a pure reorder, no path churn.
  if (newRoot === forum.path) return []

  return rows
    .filter((row) => isInSubtree(row.path, forum.path))
    .map((row) => {
      const path = rehang(row.path, forum.path, newRoot)
      return { id: row.id, path, depth: depthOf(path) }
    })
}

/**
 * Renumber the destination's children so the moved forum sits at `position`.
 *
 * Every sibling is reassigned a dense 0..n-1 order rather than only the ones
 * that shift. Sparse orders drift as forums are added and removed, and a dense
 * rewrite of a handful of rows is cheaper than reasoning about the gaps.
 */
function planOrderUpdates(
  siblings: readonly ForumRow[],
  forumId: number,
  position: number | undefined,
): { id: number; displayOrder: number }[] {
  const ids = siblings.map((s) => s.id)

  // Undefined means append; anything past the end clamps to it. An ACP drag
  // that lands below the final row means "last", not "invalid".
  const index =
    position === undefined ? ids.length : Math.min(Math.max(position, 0), ids.length)

  ids.splice(index, 0, forumId)
  return ids.map((id, displayOrder) => ({ id, displayOrder }))
}
