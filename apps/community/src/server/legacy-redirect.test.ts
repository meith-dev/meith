import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@meith/core', () => ({ env: { DATA_SOURCE: 'postgres' } }))

const settingsRef: { current: boolean } = { current: true }
vi.mock('./settings', () => ({
  getSettings: async () => ({ get: () => settingsRef.current }),
}))

const lookups: Array<{ kind: string; legacyId: number }> = []
const mapRef: { current: number | null } = { current: 77 }
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  resolveLegacyId: async (_db: unknown, kind: string, legacyId: number) => {
    lookups.push({ kind, legacyId })
    return mapRef.current
  },
}))

vi.mock('./container', () => ({
  getContainer: () => ({
    forums: {
      async listAll() {
        return [{ id: 77, slug: 'general' }]
      },
    },
  }),
}))

const { legacyDestination } = await import('./legacy-redirect')

beforeEach(() => {
  lookups.length = 0
  mapRef.current = 77
  settingsRef.current = true
})

describe('the addresses the legacy-redirect setting promises', () => {
  it('answers a rewritten thread address', async () => {
    expect(await legacyDestination('/Thread-Bikeshedding-91', {})).toBe(
      '/thread/77-thread',
    )
    expect(lookups).toEqual([{ kind: 'thread', legacyId: 91 }])
  })

  it('answers a rewritten forum address, with its slug and page', async () => {
    expect(await legacyDestination('/Forum-General-3', { page: '2' })).toBe(
      '/77-general?page=2',
    )
  })

  it('answers a rewritten post address', async () => {
    expect(await legacyDestination('/Thread-Bikeshedding--4102', {})).toBe('/post/77')
    expect(lookups).toEqual([{ kind: 'post', legacyId: 4102 }])
  })

  it('still answers the script addresses', async () => {
    expect(await legacyDestination('/showthread.php', { tid: '91' })).toBe(
      '/thread/77-thread',
    )
    expect(await legacyDestination('/index.php', {})).toBe('/')
  })

  it('answers nothing for an address that is not MyBB', async () => {
    expect(await legacyDestination('/about-us', {})).toBeNull()
    expect(lookups).toEqual([])
  })

  it('answers nothing for content that was never imported', async () => {
    mapRef.current = null
    expect(await legacyDestination('/Thread-Bikeshedding-91', {})).toBeNull()
  })

  it('answers nothing while the setting is off', async () => {
    settingsRef.current = false
    expect(await legacyDestination('/Thread-Bikeshedding-91', {})).toBeNull()
    expect(lookups).toEqual([])
  })
})
