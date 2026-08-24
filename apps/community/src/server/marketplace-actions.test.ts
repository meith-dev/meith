import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidated: string[] = []
vi.mock('next/cache', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    revalidatePath: (path: string) => {
      revalidated.push(path)
    },
  }
})

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

vi.mock('./i18n', () => ({
  tr: async (key: string) => key,
}))

const refreshResult = {
  current: { ok: true, listingCount: 2, errorMessage: null as string | null },
}
vi.mock('./marketplace-admin', () => ({
  refreshMarketplaceNow: async () => refreshResult.current,
}))

vi.mock('@meith/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@meith/core')>()),
  logger: () => ({ warn: () => {}, info: () => {}, error: () => {} }),
}))

const { refreshMarketplaceAction } = await import('./marketplace-actions')

beforeEach(() => {
  revalidated.length = 0
  adminCalls.length = 0
  requireAdminMock.mockReset().mockResolvedValue({ userId: 1 } as never)
  refreshResult.current = { ok: true, listingCount: 2, errorMessage: null }
})

describe('refreshMarketplaceAction', () => {
  it('requires an admin session', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not signed in'))

    const result = await refreshMarketplaceAction({}, new FormData())
    expect(result.error).toBeDefined()
  })

  it('revalidates both browse tabs and records the admin action on success', async () => {
    const result = await refreshMarketplaceAction({}, new FormData())

    expect(result.notice).toBe('refreshed')
    expect(revalidated).toEqual(['/admin/plugins/browse', '/admin/themes/browse'])
    expect(adminCalls).toEqual([
      { action: 'marketplace.refresh', detail: { ok: true, listingCount: 2 } },
    ])
  })

  it('returns the failure message when the refresh itself fails', async () => {
    refreshResult.current = { ok: false, listingCount: 0, errorMessage: 'could not reach the host' }

    const result = await refreshMarketplaceAction({}, new FormData())
    expect(result.error).toBe('could not reach the host')
  })
})
