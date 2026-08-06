import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_FIELDS } from '@meith/core'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
const requireFreshAdminMock = vi.fn(async () => ({ userId: 1 }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireFreshAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const invalidated: string[][] = []
vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    cache: {
      async invalidateTags(tags: string[]) {
        invalidated.push(tags)
      },
    },
  }),
}))

const saved: Array<{ groupId: number; permissions: Record<string, boolean | number> }> = []
const identities: Array<{ groupId: number; input: Record<string, unknown> }> = []
const created: Array<Record<string, unknown>> = []
const removed: Array<{ groupId: number; moveTo: number }> = []
const chunks: Array<Record<string, number>> = []

const chunkResult = { current: { moved: 2, nextCursor: 7 as number | null } }
const applied = { current: { outcomes: [{ userId: 1 }], examined: 9 } }

vi.mock('./group-admin', () => ({
  requireGroupAdmin: () => ({
    async savePermissions(groupId: number, permissions: Record<string, boolean | number>) {
      saved.push({ groupId, permissions })
    },
    async updateIdentity(groupId: number, input: Record<string, unknown>) {
      identities.push({ groupId, input })
    },
    async create(input: Record<string, unknown>) {
      created.push(input)
      return 42
    },
    async remove(groupId: number, moveTo: number) {
      removed.push({ groupId, moveTo })
    },
    async moveMembersChunk(input: Record<string, number>) {
      chunks.push(input)
      return chunkResult.current
    },
  }),
  promotionService: () => ({
    async apply() {
      return applied.current
    },
  }),
}))

const {
  applyPromotionsAction,
  createGroupAction,
  deleteGroupAction,
  moveMembersAction,
  saveGroupIdentityAction,
  saveGroupPermissionsAction,
} = await import('./group-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  saved.length = 0
  identities.length = 0
  created.length = 0
  removed.length = 0
  chunks.length = 0
  chunkResult.current = { moved: 2, nextCursor: 7 }
  applied.current = { outcomes: [{ userId: 1 }], examined: 9 }
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 1 })
  requireFreshAdminMock.mockClear()
  requireFreshAdminMock.mockResolvedValue({ userId: 1 })
})

describe('the admin gate', () => {
  it('is asked for on every write, not left to the layout', async () => {
    await saveGroupPermissionsAction({}, form({ groupId: '2' }))
    await saveGroupIdentityAction({}, form({ groupId: '2', title: 'T', displayOrder: '0' }))
    await createGroupAction({}, form({ key: 'k', title: 'T', copyFromGroupId: '2' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(3)
  })

  it('re-authenticates the three bulk operations', async () => {
    await deleteGroupAction({}, form({ groupId: '8', moveMembersTo: '2' }))
    await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))
    await applyPromotionsAction({}, form({}))

    expect(requireFreshAdminMock).toHaveBeenCalledTimes(3)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })

  it('writes nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await saveGroupPermissionsAction({}, form({ groupId: '2' }))

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
    expect(invalidated).toEqual([])
  })
})

describe('saveGroupPermissionsAction', () => {
  it('reads an unticked box as a revocation rather than as an absence', async () => {
    const boolean = PERMISSION_FIELDS.find((field) => field.kind === 'boolean')
    await saveGroupPermissionsAction({}, form({ groupId: '2' }))

    const written = saved[0]?.permissions ?? {}
    expect(Object.keys(written).sort()).toEqual(
      PERMISSION_FIELDS.map((field) => field.key).sort(),
    )
    expect(written[boolean!.key]).toBe(false)
  })

  it('keeps a ticked box ticked', async () => {
    await saveGroupPermissionsAction({}, form({ groupId: '2', canView: '1' }))
    expect(saved[0]?.permissions.canView).toBe(true)
  })

  it('takes numerics as numbers, and blank as the registry fallback', async () => {
    const numeric = PERMISSION_FIELDS.find((field) => field.kind === 'numeric')!
    await saveGroupPermissionsAction({}, form({ groupId: '2', [numeric.key]: '25' }))
    expect(saved[0]?.permissions[numeric.key]).toBe(25)

    await saveGroupPermissionsAction({}, form({ groupId: '2' }))
    expect(saved[1]?.permissions[numeric.key]).toBe(numeric.fallback)
  })

  it('refuses a numeric that is not a whole number, rather than storing NaN', async () => {
    const numeric = PERMISSION_FIELDS.find((field) => field.kind === 'numeric')!
    const state = await saveGroupPermissionsAction(
      {},
      form({ groupId: '2', [numeric.key]: 'lots' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a negative numeric', async () => {
    const numeric = PERMISSION_FIELDS.find((field) => field.kind === 'numeric')!
    const state = await saveGroupPermissionsAction(
      {},
      form({ groupId: '2', [numeric.key]: '-1' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('clears the permission tag', async () => {
    await saveGroupPermissionsAction({}, form({ groupId: '2' }))
    expect(invalidated).toEqual([['permissions']])
  })

  it('logs the group but not the permissions', async () => {
    await saveGroupPermissionsAction({}, form({ groupId: '2', canView: '1' }))
    expect(adminCalls[0]).toEqual({
      action: 'group.permissions_changed',
      detail: { groupId: 2 },
    })
  })
})

describe('saveGroupIdentityAction', () => {
  it('clears the tag for a rename too', async () => {
    await saveGroupIdentityAction(
      {},
      form({ groupId: '2', title: 'Members', displayOrder: '5' }),
    )

    expect(identities[0]?.input).toMatchObject({ title: 'Members', displayOrder: 5 })
    expect(invalidated).toEqual([['permissions']])
  })

  it('refuses an empty title', async () => {
    const state = await saveGroupIdentityAction({}, form({ groupId: '2', displayOrder: '0' }))
    expect(state.error).toBeDefined()
    expect(identities).toEqual([])
  })

  it('stores a blank description and badge as null, not as an empty string', async () => {
    await saveGroupIdentityAction(
      {},
      form({ groupId: '2', title: 'T', displayOrder: '0', description: '', badgeToken: '' }),
    )
    expect(identities[0]?.input).toMatchObject({ description: null, badgeToken: null })
  })
})

describe('createGroupAction', () => {
  it('requires a copy source, so a new group is never deny-everything', async () => {
    const state = await createGroupAction({}, form({ key: 'veterans', title: 'V' }))
    expect(state.error).toBeDefined()
    expect(created).toEqual([])
  })

  it('refuses a key that is not an identifier', async () => {
    for (const key of ['Veterans', '2fast', 'has space', 'has.dot', '']) {
      const state = await createGroupAction({}, form({ key, title: 'V', copyFromGroupId: '2' }))
      expect(state.error, key).toBeDefined()
    }
    expect(created).toEqual([])
  })

  it('creates when the key and the source are both good', async () => {
    const state = await createGroupAction(
      {},
      form({ key: 'veterans', title: 'Veterans', copyFromGroupId: '2' }),
    )

    expect(state.notice).toBe('created')
    expect(created[0]).toEqual({ key: 'veterans', title: 'Veterans', copyFromGroupId: 2 })
    expect(adminCalls[0]?.detail).toEqual({ groupId: 42, key: 'veterans' })
  })
})

describe('deleteGroupAction', () => {
  it('requires somewhere for the members to go', async () => {
    const state = await deleteGroupAction({}, form({ groupId: '8' }))
    expect(state.error).toBeDefined()
    expect(removed).toEqual([])
  })

  it('passes both groups through and clears the tag', async () => {
    const state = await deleteGroupAction({}, form({ groupId: '8', moveMembersTo: '2' }))
    expect(state.notice).toBe('deleted')
    expect(removed).toEqual([{ groupId: 8, moveTo: 2 }])
    expect(invalidated).toEqual([['permissions']])
  })
})

describe('moveMembersAction', () => {
  it('starts at the beginning and hands back where it stopped', async () => {
    const state = await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))

    expect(chunks[0]).toEqual({
      fromGroupId: 2,
      toGroupId: 3,
      afterUserId: 0,
      limit: 500,
    })
    expect(state.notice).toBe('more')
    expect(state.values).toEqual({
      fromGroupId: '2',
      toGroupId: '3',
      afterUserId: '7',
      movedSoFar: '2',
    })
  })

  it('resumes from the cursor the form carried, and accumulates the total', async () => {
    const state = await moveMembersAction(
      {},
      form({ fromGroupId: '2', toGroupId: '3', afterUserId: '7', movedSoFar: '2' }),
    )

    expect(chunks[0]?.afterUserId).toBe(7)
    expect(state.values?.movedSoFar).toBe('4')
  })

  it('says it is finished when the chunk came back short', async () => {
    chunkResult.current = { moved: 1, nextCursor: null }
    const state = await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))

    expect(state.notice).toBe('finished')
  })

  it('refuses a cursor that is not a whole number', async () => {
    const state = await moveMembersAction(
      {},
      form({ fromGroupId: '2', toGroupId: '3', afterUserId: 'wat' }),
    )

    expect(state.error).toBeDefined()
    expect(chunks).toEqual([])
  })

  it('clears the tag on every chunk, not only the last', async () => {
    await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))
    await moveMembersAction(
      {},
      form({ fromGroupId: '2', toGroupId: '3', afterUserId: '7', movedSoFar: '2' }),
    )

    expect(invalidated).toEqual([['permissions'], ['permissions']])
  })
})

describe('applyPromotionsAction', () => {
  it('runs the service and reports how many it moved', async () => {
    const state = await applyPromotionsAction({}, form({}))

    expect(state.notice).toBe('promoted:1')
    expect(invalidated).toEqual([['permissions']])
    expect(adminCalls[0]).toEqual({
      action: 'group.promotions_applied',
      detail: { promoted: 1, examined: 9 },
    })
  })
})
