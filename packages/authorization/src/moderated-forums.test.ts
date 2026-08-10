import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@meith/core'

import { Authorizer } from './authorizer'
import {
  InMemoryAuthorizationSource,
  type MemoryAppointment,
  type MemoryBoard,
} from './memory-source'
import { combinePermissionSets } from './combine'
import type { Actor } from './types'

const GROUP = { registered: 2, staff: 3, admin: 4 } as const
const FORUM = { category: 1, general: 2, nested: 3, other: 4 } as const

function set(over: Partial<PermissionSet>): PermissionSet {
  return { ...emptyPermissionSet(), ...over }
}

const READ = { canView: true, canViewThreads: true } as const

function board(moderators: readonly MemoryAppointment[] = []): MemoryBoard {
  return {
    groups: [
      { groupId: GROUP.registered, permissions: set(READ) },
      { groupId: GROUP.staff, permissions: set({ ...READ, canApproveContent: true }) },
      { groupId: GROUP.admin, permissions: set({ ...READ, isAdministrator: true }) },
    ],
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

async function moderated(
  moderators: readonly MemoryAppointment[],
  who: Actor,
): Promise<number[]> {
  const authorizer = new Authorizer(new InMemoryAuthorizationSource(board(moderators)))
  return (await authorizer.moderatedForumIds(who)).sort((a, b) => a - b)
}

describe('moderatedForumIds', () => {
  it('is empty for an ordinary member', async () => {
    expect(await moderated([], actor([GROUP.registered]))).toEqual([])
  })

  it('is the whole board for a group-level grant', async () => {
    expect(await moderated([], actor([GROUP.registered, GROUP.staff]))).toEqual([
      FORUM.category,
      FORUM.general,
      FORUM.nested,
      FORUM.other,
    ])
  })

  it('is the whole board for an administrator, who bypasses everything', async () => {
    expect(await moderated([], actor([GROUP.admin]))).toEqual([
      FORUM.category,
      FORUM.general,
      FORUM.nested,
      FORUM.other,
    ])
  })

  it('gives an appointed moderator exactly their forum', async () => {
    expect(await moderated([APPOINTMENT], actor([GROUP.registered]))).toEqual([FORUM.general])
  })

  it('follows an appointment down the tree only when it cascades', async () => {
    expect(
      await moderated([{ ...APPOINTMENT, cascadeToSubforums: true }], actor([GROUP.registered])),
    ).toEqual([FORUM.general, FORUM.nested])
  })

  it('does not follow it upwards', async () => {
    const ids = await moderated(
      [{ ...APPOINTMENT, cascadeToSubforums: true }],
      actor([GROUP.registered]),
    )
    expect(ids).not.toContain(FORUM.category)
  })

  it('does not reach a sibling subtree', async () => {
    const ids = await moderated(
      [{ ...APPOINTMENT, cascadeToSubforums: true }],
      actor([GROUP.registered]),
    )
    expect(ids).not.toContain(FORUM.other)
  })

  it('ignores an appointment that does not grant approval', async () => {
    expect(
      await moderated(
        [{ ...APPOINTMENT, canApproveContent: false }],
        actor([GROUP.registered]),
      ),
    ).toEqual([])
  })

  it('honours a group appointment as well as a personal one', async () => {
    const byGroup: MemoryAppointment = {
      ...APPOINTMENT,
      userId: null,
      groupId: GROUP.registered,
    }
    expect(await moderated([byGroup], actor([GROUP.registered], 999))).toEqual([FORUM.general])
  })

  it('ignores somebody else"s appointment', async () => {
    expect(await moderated([APPOINTMENT], actor([GROUP.registered], 11))).toEqual([])
  })

  it('drops a forum the actor cannot even view', async () => {
    const hidden: MemoryBoard = {
      ...board([APPOINTMENT]),
      overrides: [
        {
          forumId: FORUM.general,
          groupId: GROUP.registered,
          overrides: { canView: false },
        },
      ],
    }
    const authorizer = new Authorizer(new InMemoryAuthorizationSource(hidden))
    expect(await authorizer.moderatedForumIds(actor([GROUP.registered]))).toEqual([])
  })
})
