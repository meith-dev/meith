/**
 * Validation for creating a community (F16).
 *
 * Pure, like `planMove`, and for the same reason: every rule that decides
 * whether a board's structure stays coherent should be testable without a
 * database. The repository derives `path` from the parent it just validated.
 */
import { ConflictError, ValidationError } from '@meith/core'


import type { CommunityRow, NewCommunity } from './types'

/** Slugs appear in URLs, so the accepted shape is deliberately narrow. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface CreatePlan {
  readonly parentId: number | null
  /** Path of the parent, or null for a root — the repo appends the new id. */
  readonly parentPath: string | null
  readonly depth: number
  readonly displayOrder: number
}

/**
 * Check a new community against the existing tree.
 *
 * The final `path` cannot be produced here: it needs the id the database is
 * about to assign. What is returned is everything the repository needs to build
 * it in one insert — `childPath(parentPath, newId)`.
 */
export function planCreate(rows: readonly CommunityRow[], input: NewCommunity): CreatePlan {
  const title = input.title.trim()
  if (title === '') throw new ValidationError('A community needs a title.')

  if (!SLUG.test(input.slug)) {
    throw new ValidationError(
      `"${input.slug}" is not a valid slug: use lowercase letters, digits and single hyphens.`,
    )
  }

  if (input.type === 'link' && !input.linkUrl) {
    throw new ValidationError('A link community needs a linkUrl.')
  }

  const parent = input.parentId === null ? null : rows.find((r) => r.id === input.parentId)
  if (input.parentId !== null && !parent) {
    throw new ValidationError(`No such parent community: ${input.parentId}`)
  }

  // Same rule as planMove: a link is a navigation stub, not a container.
  if (parent?.type === 'link') {
    throw new ValidationError(`"${parent.title}" is a link and cannot contain communities.`)
  }

  const siblings = rows.filter((r) => r.parentId === input.parentId)
  if (siblings.some((s) => s.slug === input.slug)) {
    throw new ConflictError(
      `A community with the slug "${input.slug}" already exists in that location.`,
    )
  }

  const parentPath = parent?.path ?? null

  return {
    parentId: input.parentId,
    parentPath,
    // One below the parent. Derived from the parent's own depth rather than by
    // parsing a synthesised path — a placeholder id in a path is not a valid
    // path, and `parsePath` rightly rejects it.
    depth: parent === null || parent === undefined ? 0 : parent.depth + 1,
    displayOrder:
      input.displayOrder ??
      siblings.reduce((max, s) => Math.max(max, s.displayOrder + 1), 0),
  }
}
