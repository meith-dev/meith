import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryBanFilters } from '@meith/accounts'
import { ForbiddenError } from '@meith/core'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 7 }))
const revalidated: string[] = []

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path)
  },
}))

vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const filters = { current: new MemoryBanFilters() }

vi.mock('./ban-filter-admin', () => ({
  boardBanFilters: () => filters.current,
}))

const account = {
  current: { username: 'Admin', email: 'admin@board.example' } as {
    username: string
    email: string
  } | null,
}

vi.mock('./container', () => ({
  getContainer: () => ({
    accountStore: {
      accounts: {
        findById: async () => account.current,
      },
    },
  }),
}))

const remoteIp = { current: '203.0.113.9' as string | null }

vi.mock('./request-fingerprint', () => ({
  remoteAddress: async () => remoteIp.current,
}))

const { addBanFilterAction, removeBanFilterAction } = await import('./ban-filter-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  revalidated.length = 0
  filters.current = new MemoryBanFilters()
  account.current = { username: 'Admin', email: 'admin@board.example' }
  remoteIp.current = '203.0.113.9'
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 7 })
})

describe('the admin gate', () => {
  it('is asked for before a filter is added', async () => {
    requireAdminMock.mockRejectedValueOnce(new ForbiddenError('nope'))

    const state = await addBanFilterAction(
      {},
      form({ type: 'email', pattern: '*@blocked.example' }),
    )

    expect(state.error).toBeDefined()
    expect(await filters.current.listForAdmin()).toHaveLength(0)
  })

  it('is asked for before a filter is removed', async () => {
    const id = await filters.current.create({
      type: 'email',
      pattern: '*@blocked.example',
      createdByUserId: null,
    })
    requireAdminMock.mockRejectedValueOnce(new ForbiddenError('nope'))

    const state = await removeBanFilterAction({}, form({ id: String(id) }))

    expect(state.error).toBeDefined()
    expect(await filters.current.listForAdmin()).toHaveLength(1)
  })
})

describe('adding a filter', () => {
  it('stores the pattern, the note and who added it', async () => {
    const state = await addBanFilterAction(
      {},
      form({ type: 'email', pattern: '*@blocked.example', note: 'the March wave' }),
    )

    expect(state.notice).toBe('created')
    expect(await filters.current.listForAdmin()).toMatchObject([
      {
        type: 'email',
        pattern: '*@blocked.example',
        note: 'the March wave',
        createdByUserId: 7,
      },
    ])
  })

  it('refreshes the screen and writes to the admin log', async () => {
    await addBanFilterAction({}, form({ type: 'username', pattern: 'spam*' }))

    expect(revalidated).toEqual(['/admin/users/ban-filters'])
    expect(adminCalls).toEqual([
      {
        action: 'user.ban_filter_added',
        detail: { filterId: 1, type: 'username', pattern: 'spam*' },
      },
    ])
  })

  it('refuses a pattern matching the username of the administrator adding it', async () => {
    const state = await addBanFilterAction({}, form({ type: 'username', pattern: 'adm*' }))

    expect(state.error).toMatch(/lock you out/i)
    expect(await filters.current.listForAdmin()).toHaveLength(0)
  })

  it('refuses a pattern matching the address of the administrator adding it', async () => {
    const state = await addBanFilterAction({}, form({ type: 'email', pattern: '*@board.example' }))

    expect(state.error).toMatch(/lock you out/i)
    expect(await filters.current.listForAdmin()).toHaveLength(0)
  })

  it('refuses a pattern matching the network the administrator is on', async () => {
    const state = await addBanFilterAction({}, form({ type: 'ip', pattern: '203.0.113.*' }))

    expect(state.error).toMatch(/lock you out/i)
    expect(await filters.current.listForAdmin()).toHaveLength(0)
  })

  it('lets through a pattern that matches somebody else', async () => {
    const state = await addBanFilterAction({}, form({ type: 'username', pattern: 'spam*' }))

    expect(state.error).toBeUndefined()
    expect(state.notice).toBe('created')
  })

  it('renders a duplicate as a message on the form rather than throwing', async () => {
    await addBanFilterAction({}, form({ type: 'email', pattern: '*@blocked.example' }))
    const state = await addBanFilterAction(
      {},
      form({ type: 'email', pattern: '*@blocked.example' }),
    )

    expect(state.error).toMatch(/already holds that filter/i)
    expect(await filters.current.listForAdmin()).toHaveLength(1)
  })

  it('renders an over-long pattern as a message on the form', async () => {
    const state = await addBanFilterAction({}, form({ type: 'username', pattern: 'a'.repeat(201) }))

    expect(state.error).toBeDefined()
    expect(await filters.current.listForAdmin()).toHaveLength(0)
  })

  it('renders an over-wild pattern as a message on the form', async () => {
    const state = await addBanFilterAction(
      {},
      form({ type: 'username', pattern: `a${'*a'.repeat(21)}` }),
    )

    expect(state.error).toBeDefined()
    expect(await filters.current.listForAdmin()).toHaveLength(0)
  })

  it('refuses a type the matcher does not know', async () => {
    const state = await addBanFilterAction({}, form({ type: 'browser', pattern: 'anything' }))

    expect(state.error).toMatch(/not a kind of ban filter/i)
  })

  it('gives the form back what was typed so it need not be typed again', async () => {
    const state = await addBanFilterAction(
      {},
      form({ type: 'username', pattern: 'adm*', note: 'a note' }),
    )

    expect(state.values).toEqual({ type: 'username', pattern: 'adm*', note: 'a note' })
  })
})

describe('removing a filter', () => {
  it('removes it, refreshes the screen and writes to the admin log', async () => {
    const id = await filters.current.create({
      type: 'email',
      pattern: '*@blocked.example',
      createdByUserId: null,
    })

    const state = await removeBanFilterAction({}, form({ id: String(id) }))

    expect(state.notice).toBe('removed')
    expect(await filters.current.listForAdmin()).toHaveLength(0)
    expect(revalidated).toEqual(['/admin/users/ban-filters'])
    expect(adminCalls).toEqual([{ action: 'user.ban_filter_removed', detail: { filterId: id } }])
  })

  it('refuses an id that is not one', async () => {
    const state = await removeBanFilterAction({}, form({ id: 'nonsense' }))

    expect(state.error).toMatch(/no such ban filter/i)
  })
})
