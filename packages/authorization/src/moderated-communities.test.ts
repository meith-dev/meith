/**
 * F48 — "the communities I moderate", which is a different question from "the communities
 * I can see" and had never been asked before.
 *
 * `community_moderators` has existed since F21 with no reader, so until now the only
 * moderators the software recognised were members of a staff group. These tests
 * are about the other half: one person, one community, granular rights.
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
import type { Actor } from './types'

const GROUP = { registered: 2, staff: 3, admin: 4 } as const
const COMMUNITY = { category: 1, general: 2, nested: 3, other: 4 } as const

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
      [COMMUNITY.category]: [COMMUNITY.category],
      [COMMUNITY.general]: [COMMUNITY.general, COMMUNITY.category],
      [COMMUNITY.nested]: [COMMUNITY.nested, COMMUNITY.general, COMMUNITY.category],
      [COMMUNITY.other]: [COMMUNITY.other, COMMUNITY.category],
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
  communityId: COMMUNITY.general,
  cascadeToSubcommunities: false,
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
  return (await authorizer.moderatedCommunityIds(who)).sort((a, b) => a - b)
}

describe('moderatedCommunityIds', () => {
  it('is empty for an ordinary member', async () => {
    expect(await moderated([], actor([GROUP.registered]))).toEqual([])
  })

  it('is the whole board for a group-level grant', async () => {
    expect(await moderated([], actor([GROUP.registered, GROUP.staff]))).toEqual([
      COMMUNITY.category,
      COMMUNITY.general,
      COMMUNITY.nested,
      COMMUNITY.other,
    ])
  })

  it('is the whole board for an administrator, who bypasses everything', async () => {
    expect(await moderated([], actor([GROUP.admin]))).toEqual([
      COMMUNITY.category,
      COMMUNITY.general,
      COMMUNITY.nested,
      COMMUNITY.other,
    ])
  })

  /* The case that had no code at all before F48. */
  it('gives an appointed moderator exactly their community', async () => {
    expect(await moderated([APPOINTMENT], actor([GROUP.registered]))).toEqual([COMMUNITY.general])
  })

  it('follows an appointment down the tree only when it cascades', async () => {
    expect(
      await moderated([{ ...APPOINTMENT, cascadeToSubcommunities: true }], actor([GROUP.registered])),
    ).toEqual([COMMUNITY.general, COMMUNITY.nested])
  })

  it('does not follow it upwards', async () => {
    const ids = await moderated(
      [{ ...APPOINTMENT, cascadeToSubcommunities: true }],
      actor([GROUP.registered]),
    )
    expect(ids).not.toContain(COMMUNITY.category)
  })

  it('does not reach a sibling subtree', async () => {
    const ids = await moderated(
      [{ ...APPOINTMENT, cascadeToSubcommunities: true }],
      actor([GROUP.registered]),
    )
    expect(ids).not.toContain(COMMUNITY.other)
  })

  /*
   * An appointment's rights are granular. Somebody appointed to read the queue
   * and fix typos has not been trusted to empty it, and the set this returns is
   * "may act on", not "may look at".
   */
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
    expect(await moderated([byGroup], actor([GROUP.registered], 999))).toEqual([COMMUNITY.general])
  })

  it('ignores somebody else"s appointment', async () => {
    expect(await moderated([APPOINTMENT], actor([GROUP.registered], 11))).toEqual([])
  })

  /*
   * An appointment over a community the moderator's groups can no longer view is a
   * configuration mistake, and the safe reading of a mistake is the restrictive
   * one — otherwise an appointment becomes a way to see into a community that was
   * deliberately closed.
   */
  it('drops a community the actor cannot even view', async () => {
    const hidden: MemoryBoard = {
      ...board([APPOINTMENT]),
      overrides: [
        {
          communityId: COMMUNITY.general,
          groupId: GROUP.registered,
          overrides: { canView: false },
        },
      ],
    }
    const authorizer = new Authorizer(new InMemoryAuthorizationSource(hidden))
    expect(await authorizer.moderatedCommunityIds(actor([GROUP.registered]))).toEqual([])
  })
})
