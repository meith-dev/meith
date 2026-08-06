import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireAdminMock(),
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

const created: Array<Record<string, unknown>> = []
const updated: Array<{ id: number; input: Record<string, unknown> }> = []
const deleted: number[] = []
const prefixes: Array<Record<string, unknown>> = []
const prefixDeletes: number[] = []

vi.mock('./content-admin', () => ({
  requireContentAdmin: () => ({
    async createWordFilter(input: Record<string, unknown>) {
      created.push(input)
      return 7
    },
    async updateWordFilter(id: number, input: Record<string, unknown>) {
      updated.push({ id, input })
    },
    async deleteWordFilter(id: number) {
      deleted.push(id)
    },
    async createPrefix(input: Record<string, unknown>) {
      prefixes.push(input)
      return 3
    },
    async deletePrefix(id: number) {
      prefixDeletes.push(id)
    },
  }),
}))

const {
  createPrefixAction,
  createWordFilterAction,
  deletePrefixAction,
  deleteWordFilterAction,
  updateWordFilterAction,
} = await import('./content-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  created.length = 0
  updated.length = 0
  deleted.length = 0
  prefixes.length = 0
  prefixDeletes.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ session: { userId: 1 } })
})

describe('the admin gate', () => {
  it('is asked for on every write', async () => {
    await createWordFilterAction({}, form({ pattern: 'a' }))
    await updateWordFilterAction({}, form({ id: '1', pattern: 'a' }))
    await deleteWordFilterAction({}, form({ id: '1' }))
    await createPrefixAction({}, form({ label: 'Ask' }))
    await deletePrefixAction({}, form({ id: '1' }))

    expect(requireAdminMock).toHaveBeenCalledTimes(5)
  })

  it('writes nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await createWordFilterAction({}, form({ pattern: 'a' }))
    expect(state.error).toBeDefined()
    expect(created).toEqual([])
    expect(invalidated).toEqual([])
  })
})

describe('word filter writes', () => {
  it('clears the render-path tag on create, update and delete', async () => {
    await createWordFilterAction({}, form({ pattern: 'a' }))
    await updateWordFilterAction({}, form({ id: '1', pattern: 'a' }))
    await deleteWordFilterAction({}, form({ id: '1' }))

    expect(invalidated).toEqual([['word-filters'], ['word-filters'], ['word-filters']])
  })

  it('reads an unticked whole-word box as a substring filter', async () => {
    await createWordFilterAction({}, form({ pattern: 'a', wholeWord: '1' }))
    expect(created[0]?.wholeWord).toBe(true)

    await createWordFilterAction({}, form({ pattern: 'a' }))
    expect(created[1]?.wholeWord).toBe(false)
  })

  it('keeps a replacement of spaces rather than trimming it away', async () => {
    await createWordFilterAction({}, form({ pattern: 'a', replacement: '  ' }))
    expect(created[0]?.replacement).toBe('  ')
  })

  it('carries the enabled flag through an update', async () => {
    await updateWordFilterAction({}, form({ id: '4', pattern: 'a', enabled: '1' }))
    expect(updated[0]).toMatchObject({ id: 4, input: { enabled: true } })

    await updateWordFilterAction({}, form({ id: '4', pattern: 'a' }))
    expect(updated[1]?.input.enabled).toBe(false)
  })

  it('refuses an id that is not one', async () => {
    const state = await deleteWordFilterAction({}, form({ id: 'all' }))
    expect(state.error).toBeDefined()
    expect(deleted).toEqual([])
  })
})

describe('prefix writes', () => {
  it('clears the prefix tag rather than the filter tag', async () => {
    await createPrefixAction({}, form({ label: 'Ask' }))
    expect(invalidated).toEqual([['prefixes']])
  })

  it('reads blank optional fields as null, not as empty strings', async () => {
    await createPrefixAction({}, form({ label: 'Ask', token: '', forumPathPrefix: '' }))
    expect(prefixes[0]).toMatchObject({ token: null, forumPathPrefix: null })
  })

  it('refuses a display order that is not a whole number', async () => {
    const state = await createPrefixAction({}, form({ label: 'Ask', displayOrder: 'first' }))
    expect(state.error).toBeDefined()
    expect(prefixes).toEqual([])
  })

  it('deletes by id', async () => {
    const state = await deletePrefixAction({}, form({ id: '3' }))
    expect(state.notice).toBe('removed')
    expect(prefixDeletes).toEqual([3])
  })
})
