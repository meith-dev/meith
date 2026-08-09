/**
 * F50 — the granular half of an appointment.
 *
 * `moderatedForumIds` answers *where* somebody moderates; this answers *what*
 * they may do there. The four thread tools have no group-level permission field
 * at all — MyBB has never had one either — so an appointment and a staff bypass
 * are the only two ways to reach them, and these tests are about the first.
 */
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

  /*
   * The point of the whole feature. An appointment that can lock threads and
   * nothing else must reach exactly one of the four — which is what a board
   * appointing a "thread janitor" is asking for.
   */
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

  /* Two grants are two grants: rights union rather than the last one winning. */
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

/**
 * The two post actions an appointment can grant, which are not F50 tools and
 * were not decided like them.
 *
 * `post.editOthers` and `post.softDelete` used to read `Target.isForumModerator`
 * — which is `hasAnyModeratorRight`, true for *any* of the nine. So an
 * appointment to split threads and nothing else granted both of them, and a
 * member appointed as a thread janitor could delete other people's posts. They
 * read the right they are named after now, the way `content.approve` always
 * has.
 *
 * The two *seeing* actions deliberately still follow the flag, and the last
 * test pins that asymmetry so a later tidy-up does not "make them consistent"
 * and take the queue away from the people appointed to work it.
 */
describe('what an appointment grants over posts', () => {
  const POST_ACTIONS: readonly Action[] = [
    'post.editOthers',
    'post.softDelete',
    'content.approve',
  ]

  async function overPosts(
    who: Actor,
    moderators: readonly MemoryAppointment[],
  ): Promise<Action[]> {
    const authorizer = authorizerFor(moderators)
    const forum = await authorizer.forumMatrix(who, FORUM.general)
    const moderatorRights = await authorizer.moderatorRightsIn(who, FORUM.general)
    /* `ownerId` is somebody else: `post.editOthers` is refused to the author. */
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
      await overPosts(actor([GROUP.registered]), [appointment({ canApproveContent: true })]),
    ).toEqual(['content.approve'])
  })

  /*
   * The group columns are the other way in, and unchanged: staff who hold
   * `canEditOthersPosts` board-wide have never needed an appointment, and
   * narrowing the appointment must not have narrowed them.
   */
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
  })

  /*
   * Seeing is not acting. An appointee has to be able to read the queue and
   * find the deleted posts in the forum they look after, whichever of the nine
   * rights they hold — that is what makes `content.approve` a *second* gate
   * rather than the only one.
   */
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
