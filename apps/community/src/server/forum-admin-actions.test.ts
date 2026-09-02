import { beforeEach, describe, expect, it, vi } from 'vitest'

import { matrixCellName } from '@meith/authorization'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
const revalidated: string[] = []

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path)
  },
}))

vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: vi.fn(async () => ({ userId: 1 })),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

interface OverrideRow {
  readonly forumId: number
  readonly groupId: number
  readonly overrides: Record<string, unknown>
}

interface GroupChange {
  readonly groupId: number
  readonly values: Record<string, unknown>
}

const groupsFixture = {
  current: [
    { id: 2, title: 'Registered' },
    { id: 3, title: 'Staff' },
  ],
}
const overridesFixture = { current: [] as OverrideRow[] }
const savedGroups: GroupChange[] = []

vi.mock('./forum-admin', () => ({
  requireForumAdmin: () => ({
    async listGroups() {
      return groupsFixture.current
    },
    async readOverrides() {
      return overridesFixture.current
    },
    async saveOverridesForGroups(_forumId: number, changes: readonly GroupChange[]) {
      savedGroups.push(...changes)
    },
  }),
}))

const { saveForumPermissionMatrixAction } = await import('./forum-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

function matrixForm(
  forumId: number,
  values: Readonly<Record<number, Readonly<Record<string, string>>>>,
): FormData {
  const data = form({ forumId: String(forumId) })
  for (const [groupId, fields] of Object.entries(values)) {
    for (const [key, value] of Object.entries(fields)) {
      data.append(matrixCellName(Number(groupId), key), value)
    }
  }
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  revalidated.length = 0
  savedGroups.length = 0
  overridesFixture.current = []
  groupsFixture.current = [
    { id: 2, title: 'Registered' },
    { id: 3, title: 'Staff' },
  ]
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 1 })
})

describe('the admin gate', () => {
  it('is asked for on every save', async () => {
    await saveForumPermissionMatrixAction({}, matrixForm(5, {}))
    expect(requireAdminMock).toHaveBeenCalledTimes(1)
  })

  it('writes nothing and logs nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await saveForumPermissionMatrixAction(
      {},
      matrixForm(5, { 2: { canPostThreads: 'grant' } }),
    )

    expect(state.error).toBeDefined()
    expect(savedGroups).toEqual([])
    expect(adminCalls).toEqual([])
    expect(revalidated).toEqual([])
  })
})

describe('saveForumPermissionMatrixAction', () => {
  it('refuses a forum id that is not a forum id, before reading anything', async () => {
    const state = await saveForumPermissionMatrixAction({}, form({ forumId: 'nope' }))

    expect(state.error).toBeDefined()
    expect(savedGroups).toEqual([])
  })

  it('writes and logs a group that moves a cell from inherit to allow', async () => {
    const state = await saveForumPermissionMatrixAction(
      {},
      matrixForm(5, { 2: { canPostThreads: 'grant' } }),
    )

    expect(state.notice).toBe('saved')
    expect(savedGroups).toEqual([
      { groupId: 2, values: expect.objectContaining({ canPostThreads: true }) },
    ])
    expect(adminCalls).toEqual([
      { action: 'forum.permissions_changed', detail: { forumId: 5, groupId: 2 } },
    ])
  })

  it('writes and logs a group that moves a cell from allow to inherit', async () => {
    overridesFixture.current = [{ forumId: 5, groupId: 2, overrides: { canPostThreads: true } }]

    const state = await saveForumPermissionMatrixAction(
      {},
      matrixForm(5, { 2: { canPostThreads: 'inherit' } }),
    )

    expect(state.notice).toBe('saved')
    expect(savedGroups).toEqual([
      { groupId: 2, values: expect.objectContaining({ canPostThreads: null }) },
    ])
    expect(adminCalls).toEqual([
      { action: 'forum.permissions_changed', detail: { forumId: 5, groupId: 2 } },
    ])
  })

  it('writes nothing and logs nothing when every submitted cell matches what is already stored', async () => {
    overridesFixture.current = [{ forumId: 5, groupId: 2, overrides: { canPostThreads: true } }]

    const state = await saveForumPermissionMatrixAction(
      {},
      matrixForm(5, { 2: { canPostThreads: 'grant' } }),
    )

    expect(state.notice).toBe('saved')
    expect(savedGroups).toEqual([])
    expect(adminCalls).toEqual([])
  })

  it('leaves an untouched group out, even when a different group in the same save changed', async () => {
    overridesFixture.current = [{ forumId: 5, groupId: 3, overrides: { canPostThreads: true } }]

    await saveForumPermissionMatrixAction(
      {},
      matrixForm(5, { 2: { canPostThreads: 'grant' }, 3: { canPostThreads: 'grant' } }),
    )

    expect(savedGroups.map((change) => change.groupId)).toEqual([2])
  })

  it('logs one audit row per changed group when several change in the same save', async () => {
    await saveForumPermissionMatrixAction(
      {},
      matrixForm(5, { 2: { canPostThreads: 'grant' }, 3: { canPostThreads: 'deny' } }),
    )

    expect(savedGroups.map((change) => change.groupId).sort()).toEqual([2, 3])
    expect(adminCalls).toEqual([
      { action: 'forum.permissions_changed', detail: { forumId: 5, groupId: 2 } },
      { action: 'forum.permissions_changed', detail: { forumId: 5, groupId: 3 } },
    ])
  })

  it('reads a numeric cell left blank as inherit and a filled one as the number', async () => {
    await saveForumPermissionMatrixAction({}, matrixForm(5, { 2: { maxAttachmentsPerPost: '4' } }))

    expect(savedGroups[0]?.values.maxAttachmentsPerPost).toBe(4)
  })

  it('refreshes the screens the change is read back from', async () => {
    await saveForumPermissionMatrixAction({}, matrixForm(5, { 2: { canPostThreads: 'grant' } }))

    expect(revalidated).toEqual(['/admin/forums/[id]', '/admin/forums/[id]/permissions'])
  })
})
