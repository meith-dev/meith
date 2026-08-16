import { ConflictError, ValidationError } from '@meith/core'

import { childPath, depthOf, isInSubtree, rehang } from './path'
import type { ForumRow, MovePlan, MoveTarget, PathUpdate } from './types'

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

    if (isInSubtree(newParent.path, forum.path)) {
      throw new ValidationError(
        `Cannot move "${forum.title}" into its own descendant "${newParent.title}".`,
      )
    }

    if (newParent.type === 'link') {
      throw new ValidationError(
        `"${newParent.title}" is a link and cannot contain forums.`,
      )
    }
  }

  const siblings = rows
    .filter((r) => r.parentId === newParentId && r.id !== forum.id)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)

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
    orderUpdates: planOrderUpdates(siblings, forum.id, target),
  }
}

function planPathUpdates(
  rows: readonly ForumRow[],
  forum: ForumRow,
  newParentPath: string | null,
): PathUpdate[] {
  const newRoot = childPath(newParentPath, forum.id)

  if (newRoot === forum.path) return []

  return rows
    .filter((row) => isInSubtree(row.path, forum.path))
    .map((row) => {
      const path = rehang(row.path, forum.path, newRoot)
      return { id: row.id, path, depth: depthOf(path) }
    })
}

function planOrderUpdates(
  siblings: readonly ForumRow[],
  forumId: number,
  target: MoveTarget,
): { id: number; displayOrder: number }[] {
  const ids = siblings.map((s) => s.id)

  ids.splice(insertionIndex(ids, target), 0, forumId)
  return ids.map((id, displayOrder) => ({ id, displayOrder }))
}

function insertionIndex(ids: readonly number[], target: MoveTarget): number {
  if (target.after !== undefined) {
    if (target.after === null) return 0

    const at = ids.indexOf(target.after)
    if (at === -1) {
      throw new ConflictError(
        'The forum it was to follow is no longer there. Reload the tree and try that again.',
      )
    }
    return at + 1
  }

  const { position } = target
  return position === undefined ? ids.length : Math.min(Math.max(position, 0), ids.length)
}
