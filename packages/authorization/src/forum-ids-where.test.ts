import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@meith/core'

import { Authorizer, type BypassEvent } from './authorizer'
import { combinePermissionSets } from './combine'
import {
  InMemoryAuthorizationSource,
  type MemoryAppointment,
  type MemoryBoard,
} from './memory-source'
import type { Action, Actor } from './types'

const GROUP = { registered: 2, staff: 3, admin: 4, superMod: 5 } as const
const FORUM = { category: 1, general: 2, nested: 3, other: 4 } as const

function set(over: Partial<PermissionSet>): PermissionSet {
  return { ...emptyPermissionSet(), ...over }
}

const READ = { canView: true, canViewThreads: true } as const

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

  it('honours a group-level column an appointment-keyed scope would miss', async () => {
    const staff = actor([GROUP.registered, GROUP.staff])
    expect(await where([], staff, 'post.softDelete')).toEqual([
      FORUM.category,
      FORUM.general,
      FORUM.nested,
      FORUM.other,
    ])
  })

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

  it('sets isForumModerator, so an appointee resolves post.softDelete here too', async () => {
    const member = actor([GROUP.registered])
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
