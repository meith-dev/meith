import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@meith/core'

import { Authorizer } from './authorizer'
import { combinePermissionSets } from './combine'
import {
  InMemoryAuthorizationSource,
  type MemoryAppointment,
  type MemoryBoard,
} from './memory-source'
import { type Action, type Actor, NO_MODERATOR_RIGHTS } from './types'

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
  'thread.restore',
]

async function allowed(
  who: Actor,
  moderators: readonly MemoryAppointment[],
  forumId: number = FORUM.general,
): Promise<Action[]> {
  const authorizer = authorizerFor(moderators)
  const forum = await authorizer.forumMatrix(who, forumId)
  const moderatorRights = await authorizer.moderatorRightsIn(who, forumId)
  return TOOLS.filter((action) => authorizer.can(who, action, { forumId, forum, moderatorRights }))
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

  it('maps restoring a thread to the restore right, which deleting does not carry', async () => {
    const canRestore: MemoryAppointment = {
      ...NONE,
      userId: 10,
      forumId: FORUM.general,
      cascadeToSubforums: false,
      canRestorePosts: true,
    }

    expect(await allowed(actor([GROUP.registered]), [canRestore])).toEqual(['thread.restore'])
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
      await allowed(
        actor([GROUP.registered]),
        [{ ...base, cascadeToSubforums: true }],
        FORUM.nested,
      ),
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

describe('deleting a thread you started', () => {
  const AUTHOR = 10
  const SOMEBODY_ELSE = 77

  function authorizerWith(
    over: Partial<PermissionSet>,
    overrides: MemoryBoard['overrides'] = [],
  ): Authorizer {
    return new Authorizer(
      new InMemoryAuthorizationSource({
        ...board([]),
        groups: [{ groupId: GROUP.registered, permissions: set({ ...READ, ...over }) }],
        overrides,
      }),
    )
  }

  async function mayDelete(
    over: Partial<PermissionSet>,
    threadAuthorId: number | null,
    userId: number | null = AUTHOR,
  ): Promise<boolean> {
    const authorizer = authorizerWith(over)
    const who = actor([GROUP.registered], userId)
    const forum = await authorizer.forumMatrix(who, FORUM.general)
    return authorizer.can(who, 'thread.delete', {
      forumId: FORUM.general,
      forum,
      moderatorRights: NO_MODERATOR_RIGHTS,
      threadAuthorId,
    })
  }

  it('is refused without the permission, even to the author', async () => {
    expect(await mayDelete({}, AUTHOR)).toBe(false)
  })

  it('is granted to the author when the group carries it', async () => {
    expect(await mayDelete({ canDeleteOwnThreads: true }, AUTHOR)).toBe(true)
  })

  it('does not reach a thread somebody else started', async () => {
    expect(await mayDelete({ canDeleteOwnThreads: true }, SOMEBODY_ELSE)).toBe(false)
  })

  it('does not reach a thread with no author, nor help a guest', async () => {
    expect(await mayDelete({ canDeleteOwnThreads: true }, null)).toBe(false)
    expect(await mayDelete({ canDeleteOwnThreads: true }, null, null)).toBe(false)
  })

  it('leaves the undo to a moderator', async () => {
    const authorizer = authorizerWith({ canDeleteOwnThreads: true })
    const who = actor([GROUP.registered], AUTHOR)
    const forum = await authorizer.forumMatrix(who, FORUM.general)

    expect(
      authorizer.can(who, 'thread.restore', {
        forumId: FORUM.general,
        forum,
        moderatorRights: NO_MODERATOR_RIGHTS,
        threadAuthorId: AUTHOR,
      }),
    ).toBe(false)
  })

  it('is refused where the forum matrix denies it, whatever the group holds', async () => {
    const authorizer = authorizerWith({ canDeleteOwnThreads: true }, [
      {
        forumId: FORUM.general,
        groupId: GROUP.registered,
        overrides: { canDeleteOwnThreads: false },
      },
    ])
    const who = actor([GROUP.registered], AUTHOR)
    const forum = await authorizer.forumMatrix(who, FORUM.general)

    expect(
      authorizer.can(who, 'thread.delete', {
        forumId: FORUM.general,
        forum,
        moderatorRights: NO_MODERATOR_RIGHTS,
        threadAuthorId: AUTHOR,
      }),
    ).toBe(false)
  })
})

describe('what an appointment grants over posts', () => {
  const POST_ACTIONS: readonly Action[] = [
    'post.editOthers',
    'post.softDelete',
    'post.restore',
    'content.approve',
  ]

  async function overPosts(
    who: Actor,
    moderators: readonly MemoryAppointment[],
  ): Promise<Action[]> {
    const authorizer = authorizerFor(moderators)
    const forum = await authorizer.forumMatrix(who, FORUM.general)
    const moderatorRights = await authorizer.moderatorRightsIn(who, FORUM.general)
    return POST_ACTIONS.filter((action) =>
      authorizer.can(who, action, {
        forumId: FORUM.general,
        forum,
        ownerId: 99,
        moderatorRights,
        isForumModerator: true,
      }),
    )
  }

  function appointment(over: Partial<MemoryAppointment>): MemoryAppointment {
    return { ...NONE, userId: 10, forumId: FORUM.general, cascadeToSubforums: false, ...over }
  }

  it('grants nothing over posts for an appointment that only splits threads', async () => {
    expect(
      await overPosts(actor([GROUP.registered]), [appointment({ canSplitThreads: true })]),
    ).toEqual([])
  })

  it('grants each post action to the right that names it, and no other', async () => {
    expect(
      await overPosts(actor([GROUP.registered]), [appointment({ canEditPosts: true })]),
    ).toEqual(['post.editOthers'])

    expect(
      await overPosts(actor([GROUP.registered]), [appointment({ canSoftDeletePosts: true })]),
    ).toEqual(['post.softDelete'])

    expect(
      await overPosts(actor([GROUP.registered]), [appointment({ canRestorePosts: true })]),
    ).toEqual(['post.restore'])

    expect(
      await overPosts(actor([GROUP.registered]), [appointment({ canApproveContent: true })]),
    ).toEqual(['content.approve'])
  })

  it('grants restoring to an appointment that holds both, and to neither otherwise', async () => {
    expect(
      await overPosts(actor([GROUP.registered]), [
        appointment({ canSoftDeletePosts: true, canRestorePosts: true }),
      ]),
    ).toEqual(['post.softDelete', 'post.restore'])

    expect(
      await overPosts(actor([GROUP.registered]), [appointment({ canEditPosts: true })]),
    ).toEqual(['post.editOthers'])
  })

  it('still grants a group that holds the column outright, with no appointment', async () => {
    const authorizer = new Authorizer(
      new InMemoryAuthorizationSource({
        ...board([]),
        groups: [
          {
            groupId: GROUP.registered,
            permissions: set({ ...READ, canEditOthersPosts: true, canSoftDeletePosts: true }),
          },
        ],
      }),
    )
    const who = actor([GROUP.registered])
    const forum = await authorizer.forumMatrix(who, FORUM.general)
    const target = { forumId: FORUM.general, forum, ownerId: 99 }

    expect(authorizer.can(who, 'post.editOthers', target)).toBe(true)
    expect(authorizer.can(who, 'post.softDelete', target)).toBe(true)
    expect(authorizer.can(who, 'post.restore', target)).toBe(true)
  })

  it('lets any appointee see held and deleted content, whatever they may act on', async () => {
    const authorizer = authorizerFor([appointment({ canSplitThreads: true })])
    const who = actor([GROUP.registered])
    const forum = await authorizer.forumMatrix(who, FORUM.general)
    const moderatorRights = await authorizer.moderatorRightsIn(who, FORUM.general)
    const target = { forumId: FORUM.general, forum, moderatorRights, isForumModerator: true }

    expect(authorizer.can(who, 'content.viewUnapproved', target)).toBe(true)
    expect(authorizer.can(who, 'content.viewDeleted', target)).toBe(true)
  })
})
