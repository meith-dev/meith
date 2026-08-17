import { emptyPermissionSet, type PermissionSet } from '@meith/core'

import { combinePermissionSets } from './combine'
import type {
  Actor,
  AuthorizationSource,
  ForumOverride,
  GroupDefaults,
  ModeratorAppointment,
} from './types'

export function makePermissionSet(overrides: Partial<PermissionSet>): PermissionSet {
  return { ...emptyPermissionSet(), ...overrides }
}

export const GROUP = {
  guest: 1,
  registered: 2,
  veterans: 3,
  superMod: 5,
  admin: 6,
} as const

const PARTICIPANT_FORUM_GRANTS: Partial<PermissionSet> = {
  canView: true,
  canViewThreads: true,
  canViewOthersThreads: true,
  canSearch: true,
}

const POSTER_FORUM_GRANTS: Partial<PermissionSet> = {
  ...PARTICIPANT_FORUM_GRANTS,
  canSubscribe: true,
  canPostThreads: true,
  canPostReplies: true,
  canEditOwnPosts: true,
  canDeleteOwnPosts: true,
  canUploadAttachments: true,
  canDownloadAttachments: true,
  requiresThreadApproval: false,
  requiresPostApproval: false,
  requiresApprovalOnEdit: false,
}

export const GROUP_DEFAULTS: Record<number, PermissionSet> = {
  [GROUP.guest]: makePermissionSet({
    ...PARTICIPANT_FORUM_GRANTS,
    canViewProfiles: true,
  }),

  [GROUP.registered]: makePermissionSet({
    ...POSTER_FORUM_GRANTS,
    canViewProfiles: true,
    canViewMemberList: true,
    canUsePrivateMessages: true,
    canReportContent: true,
    editTimeLimitMinutes: 30,
    maxPostsPerDay: 50,
  }),

  [GROUP.veterans]: makePermissionSet({
    canPostPolls: true,
    canVotePolls: true,
    maxPostsPerDay: 0,
  }),

  [GROUP.superMod]: makePermissionSet({
    ...POSTER_FORUM_GRANTS,
    canViewProfiles: true,
    canViewMemberList: true,
    canUsePrivateMessages: true,
    canReportContent: true,
    canAccessModCp: true,
    isSuperModerator: true,
  }),

  [GROUP.admin]: makePermissionSet({
    ...POSTER_FORUM_GRANTS,
    canViewProfiles: true,
    canViewMemberList: true,
    canUsePrivateMessages: true,
    canAccessModCp: true,
    canAccessAdminCp: true,
    isAdministrator: true,
  }),
}

export const FORUM = {
  public: 100,
  publicSub: 101,
  private: 200,
  password: 300,
} as const

const CHAINS: Record<number, number[]> = {
  [FORUM.public]: [FORUM.public],
  [FORUM.publicSub]: [FORUM.publicSub, FORUM.public],
  [FORUM.private]: [FORUM.private],
  [FORUM.password]: [FORUM.password],
}

const OVERRIDES: ForumOverride[] = [
  ...[GROUP.guest, GROUP.registered, GROUP.veterans].map((groupId) => ({
    forumId: FORUM.private,
    groupId,
    overrides: {
      canView: false,
      canViewThreads: false,
      canSearch: false,
      canPostThreads: false,
      canPostReplies: false,
    },
  })),

  {
    forumId: FORUM.publicSub,
    groupId: GROUP.registered,
    overrides: { canPostThreads: false, canPostReplies: false },
  },
  {
    forumId: FORUM.publicSub,
    groupId: GROUP.veterans,
    overrides: { canPostThreads: false, canPostReplies: false },
  },
]

export class MemoryAuthorizationSource implements AuthorizationSource {
  async groupDefaults(groupIds: readonly number[]): Promise<GroupDefaults[]> {
    return groupIds
      .filter((id) => id in GROUP_DEFAULTS)
      .map((groupId) => ({ groupId, permissions: GROUP_DEFAULTS[groupId]! }))
  }

  async ancestorChain(forumId: number): Promise<number[]> {
    return CHAINS[forumId] ?? []
  }

  async forumOverrides(
    forumIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<ForumOverride[]> {
    const fset = new Set(forumIds)
    const gset = new Set(groupIds)
    return OVERRIDES.filter((o) => fset.has(o.forumId) && gset.has(o.groupId))
  }

  async allForumIds(): Promise<number[]> {
    return [FORUM.public, FORUM.publicSub, FORUM.private, FORUM.password]
  }

  async allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>> {
    const ids = await this.allForumIds()
    return new Map(ids.map((id) => [id, CHAINS[id] ?? []]))
  }

  async moderatorAppointments(userId: number | null): Promise<readonly ModeratorAppointment[]> {
    if (userId !== ACTORS.forumModerator.userId) return []
    return [
      {
        forumId: FORUM.public,
        cascadeToSubforums: true,
        canApproveContent: true,
        canEditPosts: true,
        canSoftDeletePosts: true,
        canRestorePosts: true,
        canOpenCloseThreads: true,
        canStickThreads: true,
        canMoveThreads: true,
        canMergeThreads: true,
        canSplitThreads: true,
      },
    ]
  }
}

function actor(
  partial: Pick<Actor, 'userId' | 'groupIds' | 'state'> & Partial<Pick<Actor, 'primaryGroupId'>>,
): Actor {
  return {
    userId: partial.userId,
    groupIds: partial.groupIds,
    primaryGroupId: partial.primaryGroupId ?? partial.groupIds[0] ?? null,
    state: partial.state,
    global: combineForActor(partial.groupIds),
    permissionVersion: 1,
  }
}

function combineForActor(groupIds: readonly number[]): PermissionSet {
  const sets = groupIds.filter((id) => id in GROUP_DEFAULTS).map((id) => GROUP_DEFAULTS[id]!)
  return combinePermissionSets(sets)
}

export const ACTORS = {
  guest: actor({ userId: null, groupIds: [GROUP.guest], state: 'guest' }),
  registered: actor({ userId: 10, groupIds: [GROUP.registered], state: 'active' }),
  secondary: actor({
    userId: 11,
    groupIds: [GROUP.registered, GROUP.veterans],
    state: 'active',
  }),
  forumModerator: actor({
    userId: 12,
    groupIds: [GROUP.registered],
    state: 'active',
  }),
  superModerator: actor({
    userId: 13,
    groupIds: [GROUP.registered, GROUP.superMod],
    state: 'active',
  }),
  administrator: actor({
    userId: 14,
    groupIds: [GROUP.registered, GROUP.admin],
    state: 'active',
  }),
  banned: actor({ userId: 15, groupIds: [GROUP.registered], state: 'banned' }),
  awaiting: actor({
    userId: 16,
    groupIds: [GROUP.registered],
    state: 'awaiting_activation',
  }),
} as const

export type ActorName = keyof typeof ACTORS
export type ForumName = keyof typeof FORUM
