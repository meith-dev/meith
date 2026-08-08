export { Authorizer } from './authorizer'
export type { AuthorizerOptions, BypassEvent } from './authorizer'
export { combineGroupValue, combinePermissionSets } from './combine'
export { InMemoryAuthorizationSource } from './memory-source'
export type { MemoryBoard } from './memory-source'
export { resolveForumMatrix, indexOverrides, forumSubset } from './resolve'
export type {
  Action,
  Actor,
  ActorSource,
  ActorState,
  AuthorizationSource,
  ContentVisibility,
  ForumOverride,
  GroupDefaults,
  NumericGlobalPermission,
  Target,
  Visible,
} from './types'
export {
  NO_MODERATOR_RIGHTS,
  hasAnyModeratorRight,
  type ModeratorAppointment,
  type ModeratorRights,
} from './types'
export type { MemoryAppointment } from './memory-source'

/** F47's vocabulary, re-exported so a caller needs one import. */
export { PUBLIC_CONTENT, type ContentScope } from '@meith/core'

export {
  buildPermissionMatrix,
  planCopyToDescendants,
  readMatrixCell,
  type CopyChange,
  type CopyPlan,
  type MatrixCell,
  type MatrixInput,
  type MatrixRow,
} from './matrix-editor'
