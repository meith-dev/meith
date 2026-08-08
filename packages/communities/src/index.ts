/**
 * @meith/communities — the community tree (F16).
 *
 * Structure only: assembly, ordering, and the reparent/reorder planner. No SQL
 * (that is `@meith/db`), no React, no permission decisions (that is
 * `@meith/authorization`, which consumes `path` for its ancestor walk).
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

export { buildTree, flattenTree, keepVisibleSubtrees } from './tree'

export { planMove } from './move'
export { planCreate, type CreatePlan } from './create'

export { CachedCommunityRepository } from './cached-repo'

export type { CommunityRepository } from './ports'

export {
  COMMUNITY_TYPES,
  type CommunityListingRow,
  type CommunityNode,
  type CommunityRow,
  type LastPostSummary,
  type CommunityType,
  type MovePlan,
  type MoveTarget,
  type NewCommunity,
  type PathUpdate,
  type TreeShaped,
} from './types'
