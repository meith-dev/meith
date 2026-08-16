import { describe, expect, it } from 'vitest'

import { PUBLIC_CONTENT, emptyPermissionSet, type PermissionSet } from '@meith/core'

import { Authorizer } from './authorizer'
import {
  InMemoryAuthorizationSource,
  type MemoryAppointment,
  type MemoryBoard,
} from './memory-source'
import { combinePermissionSets } from './combine'
import type { Actor } from './types'

const GROUP = { registered: 2, superMod: 3, admin: 4 } as const
const FORUM = { category: 1, moderated: 2, elsewhere: 3, nested: 4 } as const

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
      [FORUM.moderated]: [FORUM.moderated, FORUM.category],
      [FORUM.elsewhere]: [FORUM.elsewhere, FORUM.category],
      [FORUM.nested]: [FORUM.nested, FORUM.moderated, FORUM.category],
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

function appointment(over: Partial<MemoryAppointment>): MemoryAppointment {
  return {
    ...NONE,
    userId: 10,
    forumId: FORUM.moderated,
    cascadeToSubforums: false,
    ...over,
  }
}

function authorizerFor(moderators: readonly MemoryAppointment[]): Authorizer {
  return new Authorizer(new InMemoryAuthorizationSource(board(moderators)))
}

async function scopeIn(
  who: Actor,
  moderators: readonly MemoryAppointment[],
  forumId: number = FORUM.moderated,
): Promise<ReturnType<Authorizer['contentScope']>> {
  const authorizer = authorizerFor(moderators)
  return authorizer.contentScopeIn(who, forumId, await authorizer.forumMatrix(who, forumId))
}

const APPOINTED = [appointment({ canApproveContent: true })]

describe('contentScopeIn', () => {
  it('shows a per-forum moderator the held and deleted content of the forum they moderate', async () => {
    const scope = await scopeIn(actor([GROUP.registered]), APPOINTED)

    expect(scope.seesUnapproved).toBe(true)
    expect(scope.seesDeleted).toBe(true)
    expect([...scope.states].sort()).toEqual(['deleted', 'unapproved', 'visible'])
  })

  it('shows that same moderator nothing extra in a forum they do not moderate', async () => {
    expect(await scopeIn(actor([GROUP.registered]), APPOINTED, FORUM.elsewhere)).toEqual(
      PUBLIC_CONTENT,
    )
  })

  it('follows the appointment into subforums only when it cascades', async () => {
    expect(await scopeIn(actor([GROUP.registered]), APPOINTED, FORUM.nested)).toEqual(
      PUBLIC_CONTENT,
    )

    const cascading = [appointment({ canApproveContent: true, cascadeToSubforums: true })]
    expect((await scopeIn(actor([GROUP.registered]), cascading, FORUM.nested)).seesDeleted).toBe(
      true,
    )
  })

  it('widens for an appointment carrying any right at all, not only approval', async () => {
    const scope = await scopeIn(actor([GROUP.registered]), [
      appointment({ canSplitThreads: true }),
    ])

    expect(scope.seesUnapproved).toBe(true)
    expect(scope.seesDeleted).toBe(true)
  })

  it('leaves an ordinary member on the public scope', async () => {
    expect(await scopeIn(actor([GROUP.registered]), APPOINTED.map(byGroup))).toEqual(
      PUBLIC_CONTENT,
    )
    expect(await scopeIn(actor([GROUP.registered]), [])).toEqual(PUBLIC_CONTENT)
  })

  it('leaves a guest on the public scope', async () => {
    expect(await scopeIn(actor([GROUP.registered], null), APPOINTED)).toEqual(PUBLIC_CONTENT)
    expect(await scopeIn(actor([GROUP.registered], null), [])).toEqual(PUBLIC_CONTENT)
  })

  it('still widens for a group that holds the columns outright, with no appointment', async () => {
    const authorizer = new Authorizer(
      new InMemoryAuthorizationSource({
        ...board([]),
        groups: [
          {
            groupId: GROUP.registered,
            permissions: set({ ...READ, canViewUnapproved: true, canViewDeleted: true }),
          },
        ],
      }),
    )
    const who = actor([GROUP.registered])
    const scope = await authorizer.contentScopeIn(
      who,
      FORUM.moderated,
      await authorizer.forumMatrix(who, FORUM.moderated),
    )

    expect(scope.seesUnapproved).toBe(true)
    expect(scope.seesDeleted).toBe(true)
  })

  it('shows staff everything, as before', async () => {
    for (const group of [GROUP.superMod, GROUP.admin]) {
      const scope = await scopeIn(actor([GROUP.registered, group]), [])
      expect(scope.seesUnapproved).toBe(true)
      expect(scope.seesDeleted).toBe(true)
    }
  })

  it('shows a banned member nothing extra, appointment or not', async () => {
    const banned = { ...actor([GROUP.registered]), state: 'banned' as const }
    expect(await scopeIn(banned, APPOINTED)).toEqual(PUBLIC_CONTENT)
  })
})

function byGroup(row: MemoryAppointment): MemoryAppointment {
  const { userId: _userId, ...rest } = row
  return { ...rest, groupId: 999 }
}
