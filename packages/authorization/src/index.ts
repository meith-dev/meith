export { type ContentScope, PUBLIC_CONTENT } from '@meith/core'

export type { AuthorizerOptions, BypassEvent } from './authorizer'
export { Authorizer } from './authorizer'
export { combineGroupValue, combinePermissionSets } from './combine'
export {
  buildPermissionMatrix,
  type CopyChange,
  type CopyPlan,
  type MatrixCell,
  type MatrixInput,
  type MatrixRow,
  planCopyToDescendants,
  readMatrixCell,
} from './matrix-editor'
export type { MemoryAppointment, MemoryBoard } from './memory-source'
export { InMemoryAuthorizationSource } from './memory-source'
export { forumSubset, indexOverrides, resolveForumMatrix } from './resolve'
export type {
  Action,
  Actor,
  ActorSource,
  ActorState,
  AuthorizationSource,
  ContentVisibility,
  ForumOverride,
  GroupDefaults,
  ModeratedTarget,
  NumericGlobalPermission,
  Target,
  Visible,
} from './types'
export {
  hasAnyModeratorRight,
  type ModeratorAppointment,
  type ModeratorRights,
  NO_MODERATOR_RIGHTS,
} from './types'
