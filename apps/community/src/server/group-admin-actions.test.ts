import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_FIELDS, ValidationError } from '@meith/core'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
const requireFreshAdminMock = vi.fn(async () => ({ userId: 1 }))
const revalidated: string[] = []
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path)
  },
}))

vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireFreshAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const saved: Array<{ groupId: number; permissions: Record<string, boolean | number> }> = []
const identities: Array<{ groupId: number; input: Record<string, unknown> }> = []
const created: Array<Record<string, unknown>> = []
const removed: Array<{ groupId: number; moveTo: number }> = []
const chunks: Array<Record<string, number>> = []

const chunkResult = { current: { moved: 2, nextCursor: 7 as number | null } }
const applied = { current: { outcomes: [{ userId: 1 }], examined: 9 } }

const rulesCreated: Array<Record<string, unknown>> = []
const rulesUpdated: Array<{ id: number; input: Record<string, unknown> }> = []
const rulesToggled: Array<{ id: number; enabled: boolean }> = []
const rulesRemoved: number[] = []
const ruleRefusal = { current: null as Error | null }

function refuseIfAsked(): void {
  if (ruleRefusal.current !== null) throw ruleRefusal.current
}

vi.mock('./group-admin', () => ({
  requirePromotionRules: () => ({
    async createRule(input: Record<string, unknown>) {
      refuseIfAsked()
      rulesCreated.push(input)
      return 11
    },
    async updateRule(id: number, input: Record<string, unknown>) {
      refuseIfAsked()
      rulesUpdated.push({ id, input })
    },
    async setRuleEnabled(id: number, enabled: boolean) {
      refuseIfAsked()
      rulesToggled.push({ id, enabled })
    },
    async deleteRule(id: number) {
      refuseIfAsked()
      rulesRemoved.push(id)
    },
  }),
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
  createPromotionRuleAction,
  deleteGroupAction,
  deletePromotionRuleAction,
  moveMembersAction,
  saveGroupIdentityAction,
  saveGroupPermissionsAction,
  setPromotionRuleEnabledAction,
  updatePromotionRuleAction,
} = await import('./group-admin-actions')

const RULE = {
  title: 'Veteran',
  displayOrder: '3',
  minPostCount: '100',
  minReputation: '',
  minDaysRegistered: '',
  fromPrimaryGroupId: '2',
  toPrimaryGroupId: '50',
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  revalidated.length = 0
  saved.length = 0
  identities.length = 0
  created.length = 0
  removed.length = 0
  chunks.length = 0
  rulesCreated.length = 0
  rulesUpdated.length = 0
  rulesToggled.length = 0
  rulesRemoved.length = 0
  ruleRefusal.current = null
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
    expect(revalidated).toEqual([])
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

  it('refreshes the screens the change is read back from', async () => {
    await saveGroupPermissionsAction({}, form({ groupId: '2' }))
    expect(revalidated).toEqual(['/admin/groups', '/admin/groups/[id]'])
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
  it('refreshes them for a rename too', async () => {
    await saveGroupIdentityAction(
      {},
      form({ groupId: '2', title: 'Members', displayOrder: '5' }),
    )

    expect(identities[0]?.input).toMatchObject({ title: 'Members', displayOrder: 5 })
    expect(revalidated).toEqual(['/admin/groups', '/admin/groups/[id]'])
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

  it('names the field when the copy source was simply not chosen', async () => {
    const state = await createGroupAction(
      {},
      form({ key: 'veterans', title: 'V', copyFromGroupId: '' }),
    )

    expect(state.error).toMatch(/choose a group to copy permissions from/i)
    expect(state.error).not.toMatch(/no such group/i)
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

  it('refreshes the listing the new group belongs in', async () => {
    await createGroupAction(
      {},
      form({ key: 'veterans', title: 'Veterans', copyFromGroupId: '2' }),
    )

    expect(revalidated).toContain('/admin/groups')
  })
})

describe('deleteGroupAction', () => {
  it('requires somewhere for the members to go', async () => {
    const state = await deleteGroupAction({}, form({ groupId: '8' }))
    expect(state.error).toBeDefined()
    expect(removed).toEqual([])
  })

  it('passes both groups through and refreshes the screens', async () => {
    const state = await deleteGroupAction({}, form({ groupId: '8', moveMembersTo: '2' }))
    expect(state.notice).toBe('deleted')
    expect(removed).toEqual([{ groupId: 8, moveTo: 2 }])
    expect(revalidated).toEqual(['/admin/groups', '/admin/groups/[id]'])
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

  it('refreshes on every chunk, not only the last', async () => {
    await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))
    await moveMembersAction(
      {},
      form({ fromGroupId: '2', toGroupId: '3', afterUserId: '7', movedSoFar: '2' }),
    )

    expect(revalidated).toEqual([
      '/admin/groups',
      '/admin/groups/[id]',
      '/admin/groups',
      '/admin/groups/[id]',
    ])
  })
})

describe('applyPromotionsAction', () => {
  it('runs the service and reports how many it moved', async () => {
    const state = await applyPromotionsAction({}, form({}))

    expect(state.notice).toBe('promoted:1')
    expect(adminCalls[0]).toEqual({
      action: 'group.promotions_applied',
      detail: { promoted: 1, examined: 9 },
    })
  })

  it('refreshes the preview it just invalidated', async () => {
    await applyPromotionsAction({}, form({}))

    expect(revalidated).toEqual([
      '/admin/groups',
      '/admin/groups/[id]',
      '/admin/groups/promotions',
    ])
  })
})

describe('promotion rules', () => {
  it('asks for the admin gate on every write', async () => {
    await createPromotionRuleAction({}, form(RULE))
    await updatePromotionRuleAction({}, form({ ...RULE, id: '4' }))
    await setPromotionRuleEnabledAction({}, form({ id: '4' }))

    expect(requireAdminMock).toHaveBeenCalledTimes(3)
    expect(requireFreshAdminMock).not.toHaveBeenCalled()
  })

  it('re-authenticates a removal, because it is the one press with no undo', async () => {
    await deletePromotionRuleAction({}, form({ id: '4' }))

    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
    expect(requireAdminMock).not.toHaveBeenCalled()
    expect(rulesRemoved).toEqual([4])
  })

  it('writes nothing and logs nothing when the gate refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await createPromotionRuleAction({}, form(RULE))

    expect(state.error).toBeDefined()
    expect(rulesCreated).toEqual([])
    expect(adminCalls).toEqual([])
    expect(revalidated).toEqual([])
  })

  it('does not re-authenticate a removal it has already refused', async () => {
    requireFreshAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await deletePromotionRuleAction({}, form({ id: '4' }))

    expect(state.error).toBeDefined()
    expect(rulesRemoved).toEqual([])
    expect(adminCalls).toEqual([])
  })

  it('reads a blank criterion as no constraint, and a blank order as zero', async () => {
    await createPromotionRuleAction(
      {},
      form({ ...RULE, displayOrder: '', minDaysRegistered: '' }),
    )

    expect(rulesCreated[0]).toEqual({
      title: 'Veteran',
      displayOrder: 0,
      minPostCount: 100,
      minReputation: null,
      minDaysRegistered: null,
      fromPrimaryGroupId: 2,
      toPrimaryGroupId: 50,
    })
  })

  it('reads an unchosen source group as "any group"', async () => {
    await createPromotionRuleAction({}, form({ ...RULE, fromPrimaryGroupId: '' }))
    expect(rulesCreated[0]?.fromPrimaryGroupId).toBeNull()
  })

  it('logs the rule it created, and refreshes the screen it is read from', async () => {
    const state = await createPromotionRuleAction({}, form(RULE))

    expect(state.notice).toBe('created')
    expect(revalidated).toEqual(['/admin/groups/promotions'])
    expect(adminCalls).toEqual([
      { action: 'group.promotion_rule_added', detail: { ruleId: 11 } },
    ])
  })

  it('logs an edit against the rule it edited', async () => {
    const state = await updatePromotionRuleAction({}, form({ ...RULE, id: '4' }))

    expect(state.notice).toBe('saved')
    expect(rulesUpdated[0]?.id).toBe(4)
    expect(adminCalls).toEqual([
      { action: 'group.promotion_rule_changed', detail: { ruleId: 4 } },
    ])
  })

  it('logs which way a toggle went', async () => {
    await setPromotionRuleEnabledAction({}, form({ id: '4', enabled: '1' }))
    await setPromotionRuleEnabledAction({}, form({ id: '4' }))

    expect(rulesToggled).toEqual([
      { id: 4, enabled: true },
      { id: 4, enabled: false },
    ])
    expect(adminCalls).toEqual([
      { action: 'group.promotion_rule_toggled', detail: { ruleId: 4, enabled: true } },
      { action: 'group.promotion_rule_toggled', detail: { ruleId: 4, enabled: false } },
    ])
  })

  it('logs a removal', async () => {
    const state = await deletePromotionRuleAction({}, form({ id: '4' }))

    expect(state.notice).toBe('deleted')
    expect(adminCalls).toEqual([
      { action: 'group.promotion_rule_removed', detail: { ruleId: 4 } },
    ])
  })

  it('refuses a rule id that is not a rule id, before touching the store', async () => {
    for (const id of ['', '0', '-1', 'seven']) {
      const state = await updatePromotionRuleAction({}, form({ ...RULE, id }))
      expect(state.error, id).toMatch(/no such promotion rule/i)
    }

    expect(rulesUpdated).toEqual([])
    expect(adminCalls).toEqual([])
  })

  it('turns the store’s refusal into a message, and logs nothing', async () => {
    ruleRefusal.current = new ValidationError('A rule with no criteria matches everyone.')

    const state = await createPromotionRuleAction({}, form(RULE))

    expect(state.error).toMatch(/no criteria/i)
    expect(adminCalls).toEqual([])
    expect(revalidated).toEqual([])
  })
})
