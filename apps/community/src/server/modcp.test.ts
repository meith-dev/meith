import { beforeEach, describe, expect, it } from 'vitest'

import {
  type Actor,
  combinePermissionSets,
  InMemoryAuthorizationSource,
  type MemoryAppointment,
} from '@meith/authorization'

const { moderatedForumRights } = await import('./modcp')
const { installTestContainer, appointment } = await import('./test-container')
const { SEED_BOARD, SEED_FORUM, SEED_FORUM_ROWS, SEED_GROUP } = await import('./seed-board')

async function member(): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([SEED_GROUP.registered])
  return {
    userId: 3,
    groupIds: [SEED_GROUP.registered],
    primaryGroupId: SEED_GROUP.registered,
    state: 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

async function labelsFor(rights: Partial<MemoryAppointment>): Promise<readonly string[]> {
  installTestContainer({
    moderators: [appointment(SEED_FORUM.general, rights)],
    container: { forums: { listListing: async () => SEED_FORUM_ROWS } },
  })

  const actor = await member()
  const rows = await moderatedForumRights({
    actor,
    userId: 3,
    forumIds: [SEED_FORUM.general],
    hasGroupAccess: false,
    canWarn: false,
    canLookUpIp: false,
  })

  return rows[0]?.rights ?? []
}

beforeEach(() => {
  installTestContainer()
})

describe('what “My forums” says somebody holds', () => {
  it('names deleting and restoring separately, because they are separate grants', async () => {
    expect(await labelsFor({ canSoftDeletePosts: true })).toEqual(['Delete posts'])
    expect(await labelsFor({ canRestorePosts: true })).toEqual(['Restore posts'])
    expect(await labelsFor({ canSoftDeletePosts: true, canRestorePosts: true })).toEqual([
      'Delete posts',
      'Restore posts',
    ])
  })

  it('says nothing about a right the appointment does not carry', async () => {
    expect(await labelsFor({ canOpenCloseThreads: true })).toEqual(['Lock and unlock'])
  })
})
