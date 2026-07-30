/**
 * @forum/forums — the forum tree (F16).
 *
 * Structure only: assembly, ordering, and the reparent/reorder planner. No SQL
 * (that is `@forum/db`), no React, no permission decisions (that is
 * `@forum/authorization`, which consumes `path` for its ancestor walk).
 */

export {
  PATH_SEPARATOR,
  ancestorIds,
  childPath,
  depthOf,
  formatPath,
  isInSubtree,
  parsePath,
  rehang,
  subtreeOf,
} from './path'

export { buildTree, flattenTree } from './tree'

export { planMove } from './move'

export { CachedForumRepository } from './cached-repo'

export type { ForumRepository } from './ports'

export {
  FORUM_TYPES,
  type ForumNode,
  type ForumRow,
  type ForumType,
  type MovePlan,
  type MoveTarget,
  type PathUpdate,
  type TreeShaped,
} from './types'
