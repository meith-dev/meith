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
import { ConflictError, ValidationError } from '@meith/core'

import { childPath, depthOf, isInSubtree, rehang } from './path'
import type { CommunityRow, MovePlan, MoveTarget, PathUpdate } from './types'

/**
 * Validate a move and compute its full effect.
 *
 * `rows` must be the complete community set: the plan rewrites descendants, so a
 * partial set would silently leave some of them pointing at the old path.
 */
export function planMove(
  rows: readonly CommunityRow[],
  communityId: number,
  target: MoveTarget,
): MovePlan {
  const byId = new Map(rows.map((r) => [r.id, r]))

  const community = byId.get(communityId)
  if (!community) throw new ValidationError(`No such community: ${communityId}`)

  const { newParentId } = target
  const newParent = newParentId === null ? null : byId.get(newParentId)
  if (newParentId !== null && !newParent) {
    throw new ValidationError(`No such parent community: ${newParentId}`)
  }

  if (newParent) {
    if (newParent.id === community.id) {
      throw new ValidationError('A community cannot be its own parent.')
    }

    /*
     * The cycle guard. Moving a community *into its own subtree* would detach that
     * whole branch from the root and leave a ring of paths pointing at each
     * other — unreachable from the index and impossible to repair through the
     * ACP, since every screen navigates from the root down.
     */
    if (isInSubtree(newParent.path, community.path)) {
      throw new ValidationError(
        `Cannot move "${community.title}" into its own descendant "${newParent.title}".`,
      )
    }

    // A link is a navigation stub, not a container.
    if (newParent.type === 'link') {
      throw new ValidationError(
        `"${newParent.title}" is a link and cannot contain communities.`,
      )
    }
  }

  const siblings = rows
    .filter((r) => r.parentId === newParentId && r.id !== community.id)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)

  /*
   * Checked here rather than left to the unique index so the ACP gets "a community
   * called X already exists here" instead of a raw constraint violation. The
   * index still backs it up — this is the message, not the guarantee.
   */
  const collision = siblings.find((s) => s.slug === community.slug)
  if (collision) {
    throw new ConflictError(
      `A community with the slug "${community.slug}" already exists in that location.`,
    )
  }

  return {
    communityId,
    newParentId,
    pathUpdates: planPathUpdates(rows, community, newParent?.path ?? null),
    orderUpdates: planOrderUpdates(siblings, community.id, target.position),
  }
}

/**
 * The moved community's new path plus every descendant's, re-hung onto the new root.
 *
 * Every descendant is rewritten, not just direct children — that is the whole
 * point of the materialised path, and the thing a naive implementation misses.
 */
function planPathUpdates(
  rows: readonly CommunityRow[],
  community: CommunityRow,
  newParentPath: string | null,
): PathUpdate[] {
  const newRoot = childPath(newParentPath, community.id)

  // Already where it is being asked to go: a pure reorder, no path churn.
  if (newRoot === community.path) return []

  return rows
    .filter((row) => isInSubtree(row.path, community.path))
    .map((row) => {
      const path = rehang(row.path, community.path, newRoot)
      return { id: row.id, path, depth: depthOf(path) }
    })
}

/**
 * Renumber the destination's children so the moved community sits at `position`.
 *
 * Every sibling is reassigned a dense 0..n-1 order rather than only the ones
 * that shift. Sparse orders drift as communities are added and removed, and a dense
 * rewrite of a handful of rows is cheaper than reasoning about the gaps.
 */
function planOrderUpdates(
  siblings: readonly CommunityRow[],
  communityId: number,
  position: number | undefined,
): { id: number; displayOrder: number }[] {
  const ids = siblings.map((s) => s.id)

  // Undefined means append; anything past the end clamps to it. An ACP drag
  // that lands below the final row means "last", not "invalid".
  const index =
    position === undefined ? ids.length : Math.min(Math.max(position, 0), ids.length)

  ids.splice(index, 0, communityId)
  return ids.map((id, displayOrder) => ({ id, displayOrder }))
}
