/**
 * F52 — "where may I do X", which is a different question again from "where am
 * I a moderator".
 *
 * `moderatedForumIds` is keyed by a `ModeratorRights` field, and one of those
 * fields means two things: `canSoftDeletePosts` grants `post.softDelete`
 * through a group column *or* an appointment, and grants `thread.delete`
 * through the appointment only. These tests are about that gap, and about the
 * `isForumModerator` flag F48 recorded as debt and never set.
 */
import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@forum/core'

import { Authorizer, type BypassEvent } from './authorizer'
import {
  InMemoryAuthorizationSource,
  type MemoryAppointment,
  type MemoryBoard,
} from './memory-source'
import { combinePermissionSets } from './combine'
import type { Action, Actor } from './types'

const GROUP = { registered: 2, staff: 3, admin: 4, superMod: 5 } as const
const FORUM = { category: 1, general: 2, nested: 3, other: 4 } as const

function set(over: Partial<PermissionSet>): PermissionSet {
  return { ...emptyPermissionSet(), ...over }
}

const READ = { canView: true, canViewThreads: true } as const

/**
 * `staff` holds the *group-level* soft-delete column and nothing else. That is
 * the configuration the whole feature turns on: a Moderator usergroup that may
 * remove a post but has never been appointed to a forum.
 */
const GROUPS = [
  { groupId: GROUP.registered, permissions: set(READ) },
  { groupId: GROUP.staff, permissions: set({ ...READ, canSoftDeletePosts: true }) },
  { groupId: GROUP.admin, permissions: set({ ...READ, isAdministrator: true }) },
  { groupId: GROUP.superMod, permissions: set({ ...READ, isSuperModerator: true }) },
]

function board(moderators: readonly MemoryAppointment[] = []): MemoryBoard {
  return {
    groups: GROUPS,
    chains: {
      [FORUM.category]: [FORUM.category],
      [FORUM.general]: [FORUM.general, FORUM.category],
      [FORUM.nested]: [FORUM.nested, FORUM.general, FORUM.category],
      [FORUM.other]: [FORUM.other, FORUM.category],
    },
    overrides: [],
    moderators,
  }
}

function actor(groupIds: readonly number[], userId: number | null = 10): Actor {
  const groups = GROUPS.filter((g) => groupIds.includes(g.groupId))
  return {
    userId,
    groupIds: [...groupIds],
    primaryGroupId: groupIds[0] ?? null,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(groups.map((g) => g.permissions)),
    permissionVersion: 1,
  }
}

const APPOINTMENT: MemoryAppointment = {
  userId: 10,
  forumId: FORUM.general,
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
}

function authorizerFor(
  moderators: readonly MemoryAppointment[] = [],
  onBypass?: (e: BypassEvent) => void,
): Authorizer {
  return new Authorizer(
    new InMemoryAuthorizationSource(board(moderators)),
    onBypass === undefined ? {} : { onBypass },
  )
}

async function where(
  moderators: readonly MemoryAppointment[],
  who: Actor,
  action: Action,
): Promise<number[]> {
  return (await authorizerFor(moderators).forumIdsWhere(who, action)).sort((a, b) => a - b)
}

describe('forumIdsWhere', () => {
  it('is empty for an ordinary member', async () => {
    expect(await where([], actor([GROUP.registered]), 'thread.lock')).toEqual([])
    expect(await where([], actor([GROUP.registered]), 'post.softDelete')).toEqual([])
  })

  /*
   * The whole reason this method exists. `moderatedForumIds('canSoftDeletePosts')`
   * answers "nowhere" for this actor, because it only consults appointments for
   * that right — but `post.softDelete` is granted by the group column, so a
   * scope built from the rights key would silently disable the button.
   */
  it('honours a group-level column an appointment-keyed scope would miss', async () => {
    const staff = actor([GROUP.registered, GROUP.staff])
    expect(await where([], staff, 'post.softDelete')).toEqual([
      FORUM.category,
      FORUM.general,
      FORUM.nested,
      FORUM.other,
    ])
  })

  /*
   * And the other half of the same fact: the *thread* tools have no group-level
   * column at all (F50), so the same actor may remove a post anywhere and
   * remove a thread nowhere. Keying both off one answer gets one of them wrong.
   */
  it('gives the same actor nothing for thread.delete, which has no group column', async () => {
    const staff = actor([GROUP.registered, GROUP.staff])
    expect(await where([], staff, 'thread.delete')).toEqual([])
  })

  it('gives an appointed moderator exactly their forum, for each appointed right', async () => {
    const member = actor([GROUP.registered])
    expect(await where([APPOINTMENT], member, 'thread.lock')).toEqual([FORUM.general])
    expect(await where([APPOINTMENT], member, 'thread.delete')).toEqual([FORUM.general])
    expect(await where([APPOINTMENT], member, 'content.approve')).toEqual([FORUM.general])
  })

  it('respects a granular appointment that withholds one right', async () => {
    const member = actor([GROUP.registered])
    const cannotMove = { ...APPOINTMENT, canMoveThreads: false }
    expect(await where([cannotMove], member, 'thread.lock')).toEqual([FORUM.general])
    expect(await where([cannotMove], member, 'thread.move')).toEqual([])
  })

  it('follows an appointment down the tree only when it cascades', async () => {
    const member = actor([GROUP.registered])
    expect(await where([APPOINTMENT], member, 'thread.lock')).toEqual([FORUM.general])
    expect(
      await where([{ ...APPOINTMENT, cascadeToSubforums: true }], member, 'thread.lock'),
    ).toEqual([FORUM.general, FORUM.nested])
  })

  /*
   * `isForumModerator` set from the appointment — the flag F48 introduced and
   * then recorded as debt because nothing ever set it. Without it, an appointee
   * with no group column would resolve `post.softDelete` to false here while
   * resolving it to true on the post's own page.
   */
  it('sets isForumModerator, so an appointee resolves post.softDelete here too', async () => {
    const member = actor([GROUP.registered])
    /* No group column anywhere in this actor's groups — the appointment is all. */
    expect(await where([APPOINTMENT], member, 'post.softDelete')).toEqual([FORUM.general])
  })

  it('drops a forum the actor cannot even view', async () => {
    const hidden: MemoryBoard = {
      ...board([APPOINTMENT]),
      overrides: [
        { forumId: FORUM.general, groupId: GROUP.registered, overrides: { canView: false } },
      ],
    }
    const authorizer = new Authorizer(new InMemoryAuthorizationSource(hidden))
    expect(await authorizer.forumIdsWhere(actor([GROUP.registered]), 'thread.lock')).toEqual([])
  })

  it('ignores somebody else"s appointment', async () => {
    expect(await where([APPOINTMENT], actor([GROUP.registered], 11), 'thread.lock')).toEqual([])
  })

  it('is empty for a banned account whatever its groups say', async () => {
    const banned = { ...actor([GROUP.admin]), state: 'banned' as const }
    expect(await where([], banned, 'thread.lock')).toEqual([])
  })

  describe('the staff short-circuit', () => {
    it('gives an administrator the whole board', async () => {
      expect(await where([], actor([GROUP.admin]), 'thread.delete')).toEqual([
        FORUM.category,
        FORUM.general,
        FORUM.nested,
        FORUM.other,
      ])
    })

    it('gives a super-moderator the whole board', async () => {
      expect(await where([], actor([GROUP.superMod]), 'thread.delete')).toEqual([
        FORUM.category,
        FORUM.general,
        FORUM.nested,
        FORUM.other,
      ])
    })

    /*
     * Not an optimisation: looping would call `can()` once per forum, and every
     * one of those logs a bypass. Fifty audit lines for one page load buries
     * the bypasses that describe an actual decision.
     */
    it('logs one bypass rather than one per forum', async () => {
      for (const [group, kind] of [
        [GROUP.admin, 'administrator'],
        [GROUP.superMod, 'super_moderator'],
      ] as const) {
        const events: BypassEvent[] = []
        const authorizer = authorizerFor([], (e) => events.push(e))
        await authorizer.forumIdsWhere(actor([group]), 'thread.delete')
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({ kind, action: 'thread.delete' })
      }
    })

    /*
     * The other half of the short-circuit, and the reason it is not just an
     * optimisation: `can()` grants a super-moderator every forum-scoped action
     * before it looks at the matrix, so a scope that filtered on `canView`
     * first would refuse work the action itself would go on to permit.
     */
    it('does not narrow staff to what their groups can view, because can() does not', async () => {
      const hidden: MemoryBoard = {
        ...board(),
        overrides: [
          { forumId: FORUM.general, groupId: GROUP.superMod, overrides: { canView: false } },
        ],
      }
      const authorizer = new Authorizer(new InMemoryAuthorizationSource(hidden))
      const who = actor([GROUP.superMod])

      expect(await authorizer.forumIdsWhere(who, 'thread.delete')).toContain(FORUM.general)
      /* And the action agrees, which is the point. */
      expect(
        authorizer.can(who, 'thread.delete', {
          forumId: FORUM.general,
          forum: await authorizer.forumMatrix(who, FORUM.general),
        }),
      ).toBe(true)
    })
  })

  it('refuses a global action, which has no forum to be scoped to', async () => {
    const authorizer = authorizerFor()
    await expect(
      authorizer.forumIdsWhere(actor([GROUP.registered]), 'content.report'),
    ).rejects.toThrow(/forum-scoped/)
  })
})
