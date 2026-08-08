/**
 * The F22 world: eight actors, four community contexts, and an in-memory
 * AuthorizationSource that resolves them without a database.
 *
 * This is a fixture, not test code, so it lives in `src/` and is type-checked
 * and boundary-linted like everything else. `matrix.test.ts` drives the cross
 * product; `matrix.fixture.ts` holds the human-reviewed expected results.
 *
 * The group/community numbers here mirror the shape the Postgres source will
 * produce, so the same Authorizer runs unchanged against both.
 */
import {
  emptyPermissionSet,
  type PermissionSet,
} from '@meith/core'

import { combinePermissionSets } from './combine'
import type {
  Actor,
  AuthorizationSource,
  CommunityOverride,
  GroupDefaults,
  ModeratorAppointment,
} from './types'

/** Build a complete permission set from deny-by-default plus explicit grants. */
export function makePermissionSet(
  overrides: Partial<PermissionSet>,
): PermissionSet {
  return { ...emptyPermissionSet(), ...overrides }
}

/* ----------------------------- Group IDs ----------------------------- */
export const GROUP = {
  guest: 1,
  registered: 2,
  veterans: 3, // a secondary group
  superMod: 5,
  admin: 6,
} as const

/*
 * Community-scoped grants shared by every group that can participate. Pulled out so
 * the guest/registered/staff defaults differ only where they should.
 */
const PARTICIPANT_COMMUNITY_GRANTS: Partial<PermissionSet> = {
  canView: true,
  canViewThreads: true,
  canViewOthersThreads: true,
  canSearch: true,
}

const POSTER_COMMUNITY_GRANTS: Partial<PermissionSet> = {
  ...PARTICIPANT_COMMUNITY_GRANTS,
  // Subscribing needs an account, so it starts at the poster tier, not guests.
  canSubscribe: true,
  canPostThreads: true,
  canPostReplies: true,
  canEditOwnPosts: true,
  canDeleteOwnPosts: true,
  canUploadAttachments: true,
  canDownloadAttachments: true,
  // Trusted: content goes live immediately. `negative` fields false = exempt.
  requiresThreadApproval: false,
  requiresPostApproval: false,
  requiresApprovalOnEdit: false,
}

/** Global group defaults, keyed by group ID. */
export const GROUP_DEFAULTS: Record<number, PermissionSet> = {
  [GROUP.guest]: makePermissionSet({
    ...PARTICIPANT_COMMUNITY_GRANTS,
    canViewProfiles: true,
    // Guests never post; approval flags stay restricted (true) but are moot.
  }),

  [GROUP.registered]: makePermissionSet({
    ...POSTER_COMMUNITY_GRANTS,
    canViewProfiles: true,
    canViewMemberList: true,
    canUsePrivateMessages: true,
    canReportContent: true,
    editTimeLimitMinutes: 30,
    maxPostsPerDay: 50,
  }),

  // Secondary group: strictly additive. Grants polls and a higher cap, so a
  // registered+veterans actor must resolve to at-least-registered everywhere.
  [GROUP.veterans]: makePermissionSet({
    canPostPolls: true,
    canVotePolls: true,
    maxPostsPerDay: 0, // 0 = unlimited, must beat registered's 50
  }),

  [GROUP.superMod]: makePermissionSet({
    ...POSTER_COMMUNITY_GRANTS,
    canViewProfiles: true,
    canViewMemberList: true,
    canUsePrivateMessages: true,
    canReportContent: true,
    canAccessModCp: true,
    isSuperModerator: true,
  }),

  [GROUP.admin]: makePermissionSet({
    ...POSTER_COMMUNITY_GRANTS,
    canViewProfiles: true,
    canViewMemberList: true,
    canUsePrivateMessages: true,
    canAccessModCp: true,
    canAccessAdminCp: true,
    isAdministrator: true,
  }),
}

/* ----------------------------- Community IDs ----------------------------- */
export const COMMUNITY = {
  public: 100,
  publicSub: 101, // child of `public`, read-only override
  private: 200,
  password: 300,
} as const

/**
 * Ancestor chains, nearest first. `publicSub` is a genuine two-level tree so
 * inheritance is exercised; the others are roots.
 */
const CHAINS: Record<number, number[]> = {
  [COMMUNITY.public]: [COMMUNITY.public],
  [COMMUNITY.publicSub]: [COMMUNITY.publicSub, COMMUNITY.public],
  [COMMUNITY.private]: [COMMUNITY.private],
  [COMMUNITY.password]: [COMMUNITY.password],
}

/**
 * Per-(community, group) overrides. Only the private community and the read-only
 * subcommunity carry any; the public and password communities resolve purely from group
 * defaults (password gating is a Target flag, not a permission).
 */
const OVERRIDES: CommunityOverride[] = [
  // Private community: hide from guests and ordinary members entirely. Staff reach
  // it via bypass, not via an override, which is what R4.2 intends.
  ...[GROUP.guest, GROUP.registered, GROUP.veterans].map((groupId) => ({
    communityId: COMMUNITY.private,
    groupId,
    overrides: {
      canView: false,
      canViewThreads: false,
      canSearch: false,
      canPostThreads: false,
      canPostReplies: false,
    },
  })),

  // Read-only subcommunity: members may read but not post. canView is left null so
  // it inherits `true` from the public parent — proving inheritance and a
  // same-level override coexist.
  {
    communityId: COMMUNITY.publicSub,
    groupId: GROUP.registered,
    overrides: { canPostThreads: false, canPostReplies: false },
  },
  {
    communityId: COMMUNITY.publicSub,
    groupId: GROUP.veterans,
    overrides: { canPostThreads: false, canPostReplies: false },
  },
]

/** In-memory AuthorizationSource over the fixture data. */
export class MemoryAuthorizationSource implements AuthorizationSource {
  async groupDefaults(groupIds: readonly number[]): Promise<GroupDefaults[]> {
    return groupIds
      .filter((id) => id in GROUP_DEFAULTS)
      .map((groupId) => ({ groupId, permissions: GROUP_DEFAULTS[groupId]! }))
  }

  async ancestorChain(communityId: number): Promise<number[]> {
    return CHAINS[communityId] ?? []
  }

  async communityOverrides(
    communityIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<CommunityOverride[]> {
    const fset = new Set(communityIds)
    const gset = new Set(groupIds)
    return OVERRIDES.filter((o) => fset.has(o.communityId) && gset.has(o.groupId))
  }

  async allCommunityIds(): Promise<number[]> {
    return [COMMUNITY.public, COMMUNITY.publicSub, COMMUNITY.private, COMMUNITY.password]
  }

  async allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>> {
    const ids = await this.allCommunityIds()
    return new Map(ids.map((id) => [id, CHAINS[id] ?? []]))
  }

  /**
   * One appointment: `communityModerator` over the public tree, cascading.
   *
   * It carries every granular right, which is what makes the F22 table's
   * moderator rows readable. Appointments that grant only *some* rights are
   * exercised by `moderated-communities.test.ts`, where the point is the
   * appointment rather than the matrix.
   */
  async moderatorAppointments(
    userId: number | null,
  ): Promise<readonly ModeratorAppointment[]> {
    if (userId !== ACTORS.communityModerator.userId) return []
    return [
      {
        communityId: COMMUNITY.public,
        cascadeToSubcommunities: true,
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

/* ----------------------------- Actors ----------------------------- */
function actor(
  partial: Pick<Actor, 'userId' | 'groupIds' | 'state'> &
    Partial<Pick<Actor, 'primaryGroupId'>>,
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

/** Combine group defaults for an actor's groups (mirrors what the repo will do). */
function combineForActor(groupIds: readonly number[]): PermissionSet {
  const sets = groupIds
    .filter((id) => id in GROUP_DEFAULTS)
    .map((id) => GROUP_DEFAULTS[id]!)
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
  communityModerator: actor({
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
export type CommunityName = keyof typeof COMMUNITY
