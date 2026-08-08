/**
 * Materialised-path arithmetic (F16).
 *
 * `forums.path` is dot-separated ancestor ids, root first, **inclusive of self**:
 *
 *     Category (id 1)              '1'
 *       Forum (id 4)               '1.4'
 *         Subforum (id 9)          '1.4.9'
 *
 * Two properties the rest of the tree code leans on:
 *
 *  - "my ancestors" is a parse of my own path — no query, which is what F21's
 *    one-query permission resolution needs.
 *  - "this subtree" is a prefix match, `path = p OR path LIKE p || '.%'`.
 *
 * The `'.%'` in that second clause is load-bearing. A bare `LIKE '1.4%'` also
 * matches `'1.40'`, a *sibling*, so a reparent would drag unrelated forums with
 * it. Every subtree predicate in this codebase goes through `subtreeOf` or the
 * repository helper that mirrors it, never a hand-written LIKE.
 */
import { ValidationError } from '@meith/core'

/** Separator between ids. Kept here so nothing hardcodes '.'. */
export const PATH_SEPARATOR = '.'

/** Build a path from an ancestor id list (root first, inclusive of self). */
export function formatPath(ids: readonly number[]): string {
  return ids.join(PATH_SEPARATOR)
}

/** Parse a path into its id list, root first, inclusive of self. */
export function parsePath(path: string): number[] {
  if (path === '') return []
  return path.split(PATH_SEPARATOR).map((segment) => {
    const id = Number(segment)
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError(`Malformed forum path segment: ${segment}`)
    }
    return id
  })
}

/**
 * The ids of every ancestor, root first, **excluding** the forum itself — the
 * chain F21 walks for permission inheritance.
 */
export function ancestorIds(path: string): number[] {
  const ids = parsePath(path)
  return ids.slice(0, -1)
}

/** Depth is the number of ancestors: a root forum is depth 0. */
export function depthOf(path: string): number {
  return Math.max(parsePath(path).length - 1, 0)
}

/** The path a child of `parentPath` with id `childId` would have. */
export function childPath(parentPath: string | null, childId: number): string {
  return parentPath === null || parentPath === ''
    ? String(childId)
    : `${parentPath}${PATH_SEPARATOR}${childId}`
}

/**
 * Is `candidate` inside the subtree rooted at `ancestor` (inclusive)?
 *
 * Compares parsed segments rather than doing string prefix work, so '1.4' is
 * correctly *not* an ancestor of '1.40'.
 */
export function isInSubtree(candidate: string, ancestor: string): boolean {
  if (candidate === ancestor) return true
  return candidate.startsWith(`${ancestor}${PATH_SEPARATOR}`)
}

/**
 * The two SQL-ready predicates for "the subtree rooted here", as data rather
 * than as a string, so the repository binds them as parameters.
 */
export function subtreeOf(path: string): { exact: string; prefix: string } {
  return { exact: path, prefix: `${path}${PATH_SEPARATOR}%` }
}

/**
 * Rewrite a descendant's path when its subtree root moves.
 *
 * Takes the suffix *after* the old root path and re-hangs it under the new one,
 * rather than a `replace()` of the old prefix — `replace` substitutes every
 * occurrence anywhere in the string, so a path that happens to contain the old
 * prefix again mid-way would be corrupted.
 */
export function rehang(descendantPath: string, oldRoot: string, newRoot: string): string {
  if (!isInSubtree(descendantPath, oldRoot)) {
    throw new ValidationError(
      `${descendantPath} is not inside ${oldRoot}; refusing to rehang it`,
    )
  }
  return `${newRoot}${descendantPath.slice(oldRoot.length)}`
}
