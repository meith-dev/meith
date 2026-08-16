import type {
  ContentVisibility,
  ForumPermissions,
  PermissionSet,
} from '@meith/core'

export type ActorState = 'guest' | 'active' | 'banned' | 'awaiting_activation'

export interface Actor {
  readonly userId: number | null
  readonly groupIds: readonly number[]
  readonly primaryGroupId: number | null
  readonly state: ActorState
  readonly global: PermissionSet
  readonly permissionVersion: number
}

export type Action =
  | 'forum.view'
  | 'thread.view'
  | 'thread.viewOthers'
  | 'thread.post'
  | 'reply.post'
  | 'poll.post'
  | 'poll.vote'
  | 'thread.rate'
  | 'post.editOwn'
  | 'post.editOthers'
  | 'post.deleteOwn'
  | 'post.softDelete'
  | 'post.restore'
  | 'content.viewUnapproved'
  | 'content.viewDeleted'
  | 'content.approve'
  | 'thread.lock'
  | 'thread.stick'
  | 'thread.move'
  | 'thread.delete'
  | 'thread.restore'
  | 'thread.merge'
  | 'thread.split'
  | 'attachment.upload'
  | 'attachment.download'
  | 'forum.search'
  | 'forum.subscribe'
  | 'profile.view'
  | 'memberlist.view'
  | 'pm.use'
  | 'avatar.upload'
  | 'content.report'
  | 'modcp.access'
  | 'admincp.access'
  | 'board.viewOffline'
  | 'user.warn'
  | 'flood.bypass'
  | 'reputation.give'
  | 'signature.use'

export type NumericGlobalPermission = {
  [K in keyof PermissionSet]: PermissionSet[K] extends number ? K : never
}[keyof PermissionSet]

export type { ContentVisibility }

export interface Target {
  readonly forumId?: number
  readonly forum?: ForumPermissions
  readonly ownerId?: number | null
  readonly threadAuthorId?: number | null
  readonly visibility?: ContentVisibility
  readonly isForumModerator?: boolean
  readonly moderatorRights?: ModeratorRights
  readonly passwordRequired?: boolean
  readonly passwordSatisfied?: boolean
}

export interface ModeratedTarget extends Target {
  readonly forumId: number
  readonly forum: ForumPermissions
  readonly moderatorRights: ModeratorRights
  readonly isForumModerator: boolean
}

export interface GroupDefaults {
  readonly groupId: number
  readonly permissions: PermissionSet
}

export interface ForumOverride {
  readonly forumId: number
  readonly groupId: number
  readonly overrides: Partial<ForumPermissions>
}

export interface AuthorizationSource {
  groupDefaults(groupIds: readonly number[]): Promise<readonly GroupDefaults[]>
  ancestorChain(forumId: number): Promise<readonly number[]>
  forumOverrides(
    forumIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<readonly ForumOverride[]>
  allForumIds(): Promise<readonly number[]>

  allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>>

  moderatorAppointments(
    userId: number | null,
    groupIds: readonly number[],
  ): Promise<readonly ModeratorAppointment[]>
}

export interface ModeratorRights {
  readonly canApproveContent: boolean
  readonly canEditPosts: boolean
  readonly canSoftDeletePosts: boolean
  readonly canRestorePosts: boolean
  readonly canOpenCloseThreads: boolean
  readonly canStickThreads: boolean
  readonly canMoveThreads: boolean
  readonly canMergeThreads: boolean
  readonly canSplitThreads: boolean
}

export interface ModeratorAppointment extends ModeratorRights {
  readonly forumId: number
  readonly cascadeToSubforums: boolean
}

export function hasAnyModeratorRight(rights: ModeratorRights): boolean {
  return (
    rights.canApproveContent ||
    rights.canEditPosts ||
    rights.canSoftDeletePosts ||
    rights.canRestorePosts ||
    rights.canOpenCloseThreads ||
    rights.canStickThreads ||
    rights.canMoveThreads ||
    rights.canMergeThreads ||
    rights.canSplitThreads
  )
}

export const NO_MODERATOR_RIGHTS: ModeratorRights = {
  canApproveContent: false,
  canEditPosts: false,
  canSoftDeletePosts: false,
  canRestorePosts: false,
  canOpenCloseThreads: false,
  canStickThreads: false,
  canMoveThreads: false,
  canMergeThreads: false,
  canSplitThreads: false,
}

export interface ActorSource {
  buildGuest(): Promise<Actor>
  buildForUser(userId: number): Promise<Actor | null>
}

export interface Visible {
  readonly forumId: number
}
