import { describe, expect, it, vi } from 'vitest'

import type { CachedMarketplace, MarketplaceCacheRepository } from './cache'
import { refreshCatalog } from './refresh'
import type { MarketplaceListing } from './schema'

const BUILD = { meithVersion: '0.16.0', pluginApiMajor: 0, themeApiMajor: 0 }

function duesListing(version = '0.16.0'): MarketplaceListing {
  return {
    key: 'dues',
    kind: 'plugin',
    package: '@meith/plugin-dues',
    name: 'Dues',
    description: 'Paid memberships through Stripe.',
    screenshots: ['/marketplace/screenshots/dues-light.png'],
    version,
    apiVersion: 0,
    meith: '>=0.16 <1',
    repository: 'https://github.com/meith-dev/meith',
    licence: 'LGPL-3.0-or-later',
  }
}

function feedBody(listings: readonly MarketplaceListing[]) {
  return { schema: 'https://www.meith.dev/marketplace/v1.json#/schema', listings }
}

function fakeFetch(body: unknown, ok = true): typeof fetch {
  const text = JSON.stringify(body)
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    }),
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  }) as unknown as typeof fetch
}

function fakeRepository(): MarketplaceCacheRepository & {
  saved: CachedMarketplace
  notifiedSet: Set<string>
} {
  const state = {
    saved: {
      feed: null,
      sourceUrl: null,
      fetchedAt: null,
      error: null,
      errorAt: null,
    } as CachedMarketplace,
    notifiedSet: new Set<string>(),
  }

  return {
    get saved() {
      return state.saved
    },
    get notifiedSet() {
      return state.notifiedSet
    },
    async read() {
      return state.saved
    },
    async saveFeed({ feed, sourceUrl, fetchedAt }) {
      state.saved = { feed, sourceUrl, fetchedAt, error: null, errorAt: null }
    },
    async saveError({ message, at }) {
      state.saved = { ...state.saved, error: message, errorAt: at }
    },
    async hasNotified(key, version) {
      return state.notifiedSet.has(`${key}@${version}`)
    },
    async markNotified(key, version) {
      state.notifiedSet.add(`${key}@${version}`)
    },
  }
}

describe('refreshCatalog', () => {
  it('caches nothing and records the error when the feed is unreachable', async () => {
    const repository = fakeRepository()
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ENETUNREACH')) as unknown as typeof fetch

    const result = await refreshCatalog({
      url: 'https://meith.dev/marketplace/v1.json',
      repository,
      build: BUILD,
      resolveInstalled: () => null,
      notifyUpdate: vi.fn(),
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    expect(repository.saved.feed).toBeNull()
    expect(repository.saved.error).toContain('ENETUNREACH')
  })

  it('records a validation error and caches nothing for a malformed feed', async () => {
    const repository = fakeRepository()

    const result = await refreshCatalog({
      url: 'https://meith.dev/marketplace/v1.json',
      repository,
      build: BUILD,
      resolveInstalled: () => null,
      notifyUpdate: vi.fn(),
      fetchImpl: fakeFetch({ not: 'a feed' }),
    })

    expect(result.ok).toBe(false)
    expect(repository.saved.feed).toBeNull()
    expect(repository.saved.error).toContain('validation')
  })

  it('caches a valid feed and reports how many listings it carries', async () => {
    const repository = fakeRepository()

    const result = await refreshCatalog({
      url: 'https://meith.dev/marketplace/v1.json',
      repository,
      build: BUILD,
      resolveInstalled: () => null,
      notifyUpdate: vi.fn(),
      fetchImpl: fakeFetch(feedBody([duesListing()])),
    })

    expect(result).toMatchObject({ ok: true, listingCount: 1, notified: 0 })
    expect(repository.saved.feed?.listings).toHaveLength(1)
    expect(repository.saved.error).toBeNull()
  })

  it('notifies administrators exactly once for a new plugin version', async () => {
    const repository = fakeRepository()
    const notifyUpdate = vi.fn().mockResolvedValue(undefined)

    const run = () =>
      refreshCatalog({
        url: 'https://meith.dev/marketplace/v1.json',
        repository,
        build: BUILD,
        resolveInstalled: () => ({ enabled: true, version: '0.16.0' }),
        notifyUpdate,
        fetchImpl: fakeFetch(feedBody([duesListing('0.17.0')])),
      })

    const first = await run()
    expect(first.notified).toBe(1)
    expect(notifyUpdate).toHaveBeenCalledTimes(1)
    expect(notifyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'dues', version: '0.17.0' }),
    )

    // The next tick sees the same feed and the same installed version again —
    // this is the daily task running again before the operator has updated.
    const second = await run()
    expect(second.notified).toBe(0)
    expect(notifyUpdate).toHaveBeenCalledTimes(1)
  })

  it('notifies again for a second, later version — dedupe is per version, not per plugin', async () => {
    const repository = fakeRepository()
    const notifyUpdate = vi.fn().mockResolvedValue(undefined)

    await refreshCatalog({
      url: 'https://meith.dev/marketplace/v1.json',
      repository,
      build: BUILD,
      resolveInstalled: () => ({ enabled: true, version: '0.16.0' }),
      notifyUpdate,
      fetchImpl: fakeFetch(feedBody([duesListing('0.17.0')])),
    })

    await refreshCatalog({
      url: 'https://meith.dev/marketplace/v1.json',
      repository,
      build: BUILD,
      resolveInstalled: () => ({ enabled: true, version: '0.16.0' }),
      notifyUpdate,
      fetchImpl: fakeFetch(feedBody([duesListing('0.18.0')])),
    })

    expect(notifyUpdate).toHaveBeenCalledTimes(2)
  })

  it('never notifies for a plugin this board has not installed', async () => {
    const repository = fakeRepository()
    const notifyUpdate = vi.fn().mockResolvedValue(undefined)

    const result = await refreshCatalog({
      url: 'https://meith.dev/marketplace/v1.json',
      repository,
      build: BUILD,
      resolveInstalled: () => null,
      notifyUpdate,
      fetchImpl: fakeFetch(feedBody([duesListing('0.17.0')])),
    })

    expect(result.notified).toBe(0)
    expect(notifyUpdate).not.toHaveBeenCalled()
  })

  it('never notifies for an incompatible update', async () => {
    const repository = fakeRepository()
    const notifyUpdate = vi.fn().mockResolvedValue(undefined)

    const result = await refreshCatalog({
      url: 'https://meith.dev/marketplace/v1.json',
      repository,
      build: BUILD,
      resolveInstalled: () => ({ enabled: true, version: '0.16.0' }),
      notifyUpdate,
      fetchImpl: fakeFetch(feedBody([{ ...duesListing('0.17.0'), apiVersion: 9 }])),
    })

    expect(result.notified).toBe(0)
    expect(notifyUpdate).not.toHaveBeenCalled()
  })
})
