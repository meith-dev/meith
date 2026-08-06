import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@meith/core'

import { Authorizer } from './authorizer'
import {
  InMemoryAuthorizationSource,
  type MemoryAppointment,
  type MemoryBoard,
} from './memory-source'
import { combinePermissionSets } from './combine'
import { NO_MODERATOR_RIGHTS, type Action, type Actor } from './types'

const GROUP = { registered: 2, superMod: 3, admin: 4 } as const
const FORUM = { category: 1, general: 2, nested: 3 } as const

function set(over: Partial<PermissionSet>): PermissionSet {
  return { ...emptyPermissionSet(), ...over }
}

const READ = { canView: true, canViewThreads: true } as const

function board(moderators: readonly MemoryAppointment[] = []): MemoryBoard {
  return {
    groups: [
      { groupId: GROUP.registered, permissions: set(READ) },
      { groupId: GROUP.superMod, permissions: set({ ...READ, isSuperModerator: true }) },
      { groupId: GROUP.admin, permissions: set({ ...READ, isAdministrator: true }) },
    ],
    chains: {
      [FORUM.category]: [FORUM.category],
      [FORUM.general]: [FORUM.general, FORUM.category],
      [FORUM.nested]: [FORUM.nested, FORUM.general, FORUM.category],
    },
    overrides: [],
    moderators,
  }
}

function actor(groupIds: readonly number[], userId: number | null = 10): Actor {
  const groups = board().groups.filter((g) => groupIds.includes(g.groupId))
  return {
    userId,
    groupIds: [...groupIds],
    primaryGroupId: groupIds[0] ?? null,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(groups.map((g) => g.permissions)),
    permissionVersion: 1,
  }
}

const NONE: Omit<MemoryAppointment, 'forumId' | 'cascadeToSubforums'> = {
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

function authorizerFor(moderators: readonly MemoryAppointment[]): Authorizer {
  return new Authorizer(new InMemoryAuthorizationSource(board(moderators)))
}

const TOOLS: readonly Action[] = [
  'thread.lock',
  'thread.stick',
  'thread.move',
  'thread.delete',
]

async function allowed(
  who: Actor,
  moderators: readonly MemoryAppointment[],
  forumId: number = FORUM.general,
): Promise<Action[]> {
  const authorizer = authorizerFor(moderators)
  const forum = await authorizer.forumMatrix(who, forumId)
  const moderatorRights = await authorizer.moderatorRightsIn(who, forumId)
  return TOOLS.filter((action) =>
    authorizer.can(who, action, { forumId, forum, moderatorRights }),
  )
}

describe('moderatorRightsIn', () => {
  it('is nothing for an ordinary member', async () => {
    expect(
      await authorizerFor([]).moderatorRightsIn(actor([GROUP.registered]), FORUM.general),
    ).toEqual(NO_MODERATOR_RIGHTS)
    expect(await allowed(actor([GROUP.registered]), [])).toEqual([])
  })

  it('is nothing for a guest', async () => {
    expect(
      await authorizerFor([]).moderatorRightsIn(actor([GROUP.registered], null), FORUM.general),
    ).toEqual(NO_MODERATOR_RIGHTS)
  })

  it('is everything for staff, who bypass anyway', async () => {
    for (const group of [GROUP.superMod, GROUP.admin]) {
      expect(await allowed(actor([GROUP.registered, group]), [])).toEqual(TOOLS)
    }
  })

  it('grants exactly the rights the appointment carries', async () => {
    const canLockOnly: MemoryAppointment = {
      ...NONE,
      userId: 10,
      forumId: FORUM.general,
      cascadeToSubforums: false,
      canOpenCloseThreads: true,
    }

    expect(await allowed(actor([GROUP.registered]), [canLockOnly])).toEqual(['thread.lock'])
  })

  it('maps deleting a thread to the soft-delete right', async () => {
    const canDelete: MemoryAppointment = {
      ...NONE,
      userId: 10,
      forumId: FORUM.general,
      cascadeToSubforums: false,
      canSoftDeletePosts: true,
    }

    expect(await allowed(actor([GROUP.registered]), [canDelete])).toEqual(['thread.delete'])
  })

  it('follows the appointment down the tree only when it cascades', async () => {
    const base: MemoryAppointment = {
      ...NONE,
      userId: 10,
      forumId: FORUM.general,
      cascadeToSubforums: false,
      canMoveThreads: true,
    }

    expect(await allowed(actor([GROUP.registered]), [base], FORUM.nested)).toEqual([])
    expect(
      await allowed(actor([GROUP.registered]), [{ ...base, cascadeToSubforums: true }], FORUM.nested),
    ).toEqual(['thread.move'])
  })

  it('does not reach the parent forum', async () => {
    const cascading: MemoryAppointment = {
      ...NONE,
      userId: 10,
      forumId: FORUM.general,
      cascadeToSubforums: true,
      canMoveThreads: true,
    }

    expect(await allowed(actor([GROUP.registered]), [cascading], FORUM.category)).toEqual([])
  })

  it('unions rights across a personal and a group appointment', async () => {
    const personal: MemoryAppointment = {
      ...NONE,
      userId: 10,
      forumId: FORUM.general,
      cascadeToSubforums: false,
      canOpenCloseThreads: true,
    }
    const byGroup: MemoryAppointment = {
      ...NONE,
      groupId: GROUP.registered,
      forumId: FORUM.general,
      cascadeToSubforums: false,
      canStickThreads: true,
    }

    expect(await allowed(actor([GROUP.registered]), [personal, byGroup])).toEqual([
      'thread.lock',
      'thread.stick',
    ])
  })

  it('is nothing for a forum that does not exist', async () => {
    expect(await authorizerFor([]).moderatorRightsIn(actor([GROUP.registered]), 4242)).toEqual(
      NO_MODERATOR_RIGHTS,
    )
  })
})
