import { emptyPermissionSet, type PermissionSet } from '@meith/core'
import { describe, expect, it } from 'vitest'

import { Authorizer } from './authorizer'
import { combinePermissionSets } from './combine'
import type {
  Actor,
  AuthorizationSource,
  ForumOverride,
  GroupDefaults,
  ModeratorAppointment,
} from './types'

const GROUP = { guest: 1, registered: 2 } as const

const FORUM = { lounge: 10, desk: 11 } as const

const READER: Partial<PermissionSet> = {
  canView: true,
  canViewThreads: true,
  canViewOthersThreads: true,
  canSearch: true,
}

const DEFAULTS: Record<number, PermissionSet> = {
  [GROUP.guest]: { ...emptyPermissionSet(), ...READER },
  [GROUP.registered]: { ...emptyPermissionSet(), ...READER },
}

const CHAINS: Record<number, number[]> = {
  [FORUM.lounge]: [FORUM.lounge],
  [FORUM.desk]: [FORUM.desk],
}

const DENIALS: readonly ForumOverride[] = [GROUP.guest, GROUP.registered].map(
  (groupId) => ({
    forumId: FORUM.desk,
    groupId,
    overrides: { canViewOthersThreads: false },
  }),
)

const MODERATOR_USER_ID = 42

class Source implements AuthorizationSource {
  async groupDefaults(
    groupIds: readonly number[],
  ): Promise<readonly GroupDefaults[]> {
    return groupIds
      .filter((id) => id in DEFAULTS)
      .map((groupId) => ({ groupId, permissions: DEFAULTS[groupId]! }))
  }

  async ancestorChain(forumId: number): Promise<readonly number[]> {
    return CHAINS[forumId] ?? []
  }

  async forumOverrides(
    forumIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<readonly ForumOverride[]> {
    const forums = new Set(forumIds)
    const groups = new Set(groupIds)
    return DENIALS.filter(
      (row) => forums.has(row.forumId) && groups.has(row.groupId),
    )
  }

  async allForumIds(): Promise<readonly number[]> {
    return [FORUM.lounge, FORUM.desk]
  }

  async allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>> {
    return new Map([
      [FORUM.lounge, CHAINS[FORUM.lounge]!],
      [FORUM.desk, CHAINS[FORUM.desk]!],
    ])
  }

  async moderatorAppointments(
    userId: number | null,
  ): Promise<readonly ModeratorAppointment[]> {
    if (userId !== MODERATOR_USER_ID) return []
    return [
      {
        forumId: FORUM.desk,
        cascadeToSubforums: false,
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
  partial: Pick<Actor, 'userId' | 'groupIds' | 'state'>,
): Actor {
  return {
    ...partial,
    primaryGroupId: partial.groupIds[0] ?? null,
    global: combinePermissionSets(
      partial.groupIds.filter((id) => id in DEFAULTS).map((id) => DEFAULTS[id]!),
    ),
    permissionVersion: 1,
  }
}

const GUEST = actor({ userId: null, groupIds: [GROUP.guest], state: 'guest' })
const MEMBER = actor({
  userId: 7,
  groupIds: [GROUP.registered],
  state: 'active',
})
const MODERATOR = actor({
  userId: MODERATOR_USER_ID,
  groupIds: [GROUP.registered],
  state: 'active',
})

const authorizer = new Authorizer(new Source())

async function targetIn(who: Actor, forumId: number) {
  return authorizer.moderatorTargetIn(
    who,
    forumId,
    await authorizer.forumMatrix(who, forumId),
  )
}

describe('canViewOthersThreads', () => {
  it('lets a member open a thread they started in a deny forum', async () => {
    const target = await targetIn(MEMBER, FORUM.desk)

    expect(
      authorizer.can(MEMBER, 'thread.view', { ...target, threadAuthorId: 7 }),
    ).toBe(true)
  })

  it('refuses a member somebody else’s thread in a deny forum', async () => {
    const target = await targetIn(MEMBER, FORUM.desk)

    expect(
      authorizer.can(MEMBER, 'thread.view', { ...target, threadAuthorId: 8 }),
    ).toBe(false)
    expect(
      authorizer.can(MEMBER, 'thread.view', { ...target, threadAuthorId: null }),
    ).toBe(false)
  })

  it('still lets that member into the forum itself', async () => {
    const target = await targetIn(MEMBER, FORUM.desk)

    expect(authorizer.can(MEMBER, 'thread.view', target)).toBe(true)
    expect(authorizer.can(MEMBER, 'thread.viewOthers', target)).toBe(false)
  })

  it('leaves a granted forum alone', async () => {
    const target = await targetIn(MEMBER, FORUM.lounge)

    expect(
      authorizer.can(MEMBER, 'thread.view', { ...target, threadAuthorId: 8 }),
    ).toBe(true)
    expect(authorizer.can(MEMBER, 'thread.viewOthers', target)).toBe(true)
  })

  it('gives a forum moderator the whole deny forum', async () => {
    const target = await targetIn(MODERATOR, FORUM.desk)

    expect(
      authorizer.can(MODERATOR, 'thread.view', { ...target, threadAuthorId: 8 }),
    ).toBe(true)
    expect(authorizer.can(MODERATOR, 'thread.viewOthers', target)).toBe(true)
  })

  it('shows a guest nothing in a deny forum, because a guest authored nothing', async () => {
    const target = await targetIn(GUEST, FORUM.desk)

    expect(authorizer.can(GUEST, 'thread.view', target)).toBe(true)
    expect(
      authorizer.can(GUEST, 'thread.view', { ...target, threadAuthorId: null }),
    ).toBe(false)
    expect(authorizer.authorFilter(GUEST, target)).toEqual({ kind: 'none' })
  })

  it('reports the deny forum in the audience so listings can filter in SQL', async () => {
    expect(await authorizer.threadAudience(MEMBER)).toEqual({
      forumIds: [FORUM.lounge, FORUM.desk],
      ownThreadsOnlyForumIds: [FORUM.desk],
      viewerUserId: 7,
    })

    expect(await authorizer.threadAudience(MODERATOR)).toEqual({
      forumIds: [FORUM.lounge, FORUM.desk],
      ownThreadsOnlyForumIds: [],
      viewerUserId: MODERATOR_USER_ID,
    })
  })

  it('reports the deny forum to the board index too', async () => {
    expect(await authorizer.listingVisibility(MEMBER)).toEqual({
      visibleForumIds: [FORUM.lounge, FORUM.desk],
      ownThreadsOnlyForumIds: [FORUM.desk],
    })
  })

  it('turns the resolved right into an author filter', async () => {
    expect(
      authorizer.authorFilter(MEMBER, await targetIn(MEMBER, FORUM.desk)),
    ).toEqual({ kind: 'author', userId: 7 })
    expect(
      authorizer.authorFilter(MEMBER, await targetIn(MEMBER, FORUM.lounge)),
    ).toEqual({ kind: 'all' })
  })
})
