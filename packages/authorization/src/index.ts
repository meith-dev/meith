export { type ContentScope, PUBLIC_CONTENT } from '@meith/core'

export type { AuthorizerOptions, BypassEvent } from './authorizer'
export { Authorizer } from './authorizer'
export { combineGroupValue, combinePermissionSets } from './combine'
export {
  buildFieldMatrix,
  buildPermissionMatrix,
  type CopyChange,
  type CopyPlan,
  diffMatrixSubmission,
  type FieldMatrixCell,
  type FieldMatrixRow,
  type MatrixCell,
  type MatrixColumn,
  type MatrixGroupSubmission,
  type MatrixInput,
  type MatrixRow,
  matrixCellName,
  matrixColumns,
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
