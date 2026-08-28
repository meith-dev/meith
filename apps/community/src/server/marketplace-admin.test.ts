import { beforeEach, describe, expect, it, vi } from 'vitest'

function pluginListing(overrides: Record<string, unknown> = {}) {
  return {
    key: 'dues',
    kind: 'plugin',
    package: '@meith/plugin-dues',
    name: 'Dues',
    description: 'Paid memberships through Stripe.',
    screenshots: ['/marketplace/screenshots/dues-light.png'],
    version: '0.16.0',
    apiVersion: 0,
    meith: '>=0.16 <1',
    repository: 'https://github.com/meith-dev/meith',
    licence: 'MIT',
    ...overrides,
  }
}

function themeListingEntry(overrides: Record<string, unknown> = {}) {
  return {
    key: 'clubhouse',
    kind: 'theme',
    package: '@meith/theme-clubhouse',
    name: 'Clubhouse',
    description: 'A sports club theme.',
    screenshots: ['/marketplace/screenshots/clubhouse-light.png'],
    version: '0.16.0',
    apiVersion: 0,
    meith: '>=0.16 <1',
    repository: 'https://github.com/meith-dev/meith',
    licence: 'MIT',
    ...overrides,
  }
}

const dataSource = { current: 'postgres' as 'postgres' | 'fixture' }

const cache = {
  current: { feed: null, sourceUrl: null, fetchedAt: null, error: null, errorAt: null } as {
    feed: { schema: string; listings: unknown[] } | null
    sourceUrl: string | null
    fetchedAt: Date | null
    error: string | null
    errorAt: string | null
  },
}

const repositoryCalls = { saveFeed: [] as unknown[], saveError: [] as unknown[] }

vi.mock('@meith/core', () => ({
  get env() {
    return { DATA_SOURCE: dataSource.current }
  },
  logger: () => ({ warn: () => {}, info: () => {}, error: () => {} }),
  readPluginEnv: (name: string) => {
    const value = process.env[name]
    return value === undefined || value === '' ? undefined : value
  },
}))

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresMarketplaceCacheRepository: class {
    async read() {
      return cache.current
    }
    async saveFeed(input: unknown) {
      repositoryCalls.saveFeed.push(input)
    }
    async saveError(input: unknown) {
      repositoryCalls.saveError.push(input)
    }
    async claimNotified() {
      return true
    }
  },
}))

const configuredPlugins = { current: [] as Array<Record<string, unknown>> }
vi.mock('./plugin-host', () => ({
  configuredPlugins: () => configuredPlugins.current,
}))

const themes = { current: [] as Array<Record<string, unknown>> }
vi.mock('./theme-admin', () => ({
  themeListing: async () => themes.current,
}))

const settingsSnapshot = { feedUrl: 'https://www.meith.dev/marketplace/v1.json' }
vi.mock('./settings', () => ({
  getSettings: async () => ({ get: () => settingsSnapshot.feedUrl }),
  getSettingsUncached: async () => ({ get: () => settingsSnapshot.feedUrl }),
}))

const notifyMock = vi.fn()
vi.mock('./notifications', () => ({
  notificationService: () => ({ raiseForAdministrators: notifyMock }),
}))

const { marketplaceUpdates, refreshMarketplaceNow, currentFeedUrl } = await import(
  './marketplace-admin'
)

function fetched(listings: unknown[]) {
  return {
    feed: { schema: 'x', listings },
    sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
    fetchedAt: new Date(),
    error: null,
    errorAt: null,
  }
}

beforeEach(() => {
  dataSource.current = 'postgres'
  cache.current = { feed: null, sourceUrl: null, fetchedAt: null, error: null, errorAt: null }
  configuredPlugins.current = []
  themes.current = []
  repositoryCalls.saveFeed = []
  repositoryCalls.saveError = []
  notifyMock.mockReset()
})

describe('marketplaceUpdates', () => {
  it('reports "not fetched yet" before any fetch has ever succeeded', async () => {
    const result = await marketplaceUpdates('plugin')
    expect(result.hasEverFetched).toBe(false)
    expect(result.unreachable).toBe(false)
    expect(result.latestByKey.size).toBe(0)
  })

  it('reports unreachable when the cache carries an error', async () => {
    cache.current = {
      feed: null,
      sourceUrl: null,
      fetchedAt: null,
      error: 'could not reach the host',
      errorAt: '2026-01-01T00:00:00Z',
    }

    const result = await marketplaceUpdates('plugin')
    expect(result.unreachable).toBe(true)
  })

  it('names a plugin whose feed version is newer than what this board runs', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: true, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    cache.current = fetched([pluginListing({ version: '0.17.0' })])

    const result = await marketplaceUpdates('plugin')
    expect(result.latestByKey.get('dues')).toBe('0.17.0')
  })

  it('offers no update when the installed plugin is already at the listed version', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: true, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    cache.current = fetched([pluginListing({ version: '0.16.0' })])

    const result = await marketplaceUpdates('plugin')
    expect(result.latestByKey.size).toBe(0)
  })

  it('offers no update for a newer but incompatible version', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: true, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    cache.current = fetched([pluginListing({ version: '0.17.0', apiVersion: 9 })])

    const result = await marketplaceUpdates('plugin')
    expect(result.latestByKey.size).toBe(0)
  })

  it('names a theme update using the version tracked in the theme registry', async () => {
    themes.current = [{ key: 'clubhouse', enabled: true, version: '0.16.0' }]
    cache.current = fetched([themeListingEntry({ version: '0.17.0' })])

    const result = await marketplaceUpdates('theme')
    expect(result.latestByKey.get('clubhouse')).toBe('0.17.0')
  })

  it('ignores listings of the other kind', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: true, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    themes.current = [{ key: 'clubhouse', enabled: true, version: '0.16.0' }]
    cache.current = fetched([
      pluginListing({ version: '0.17.0' }),
      themeListingEntry({ version: '0.17.0' }),
    ])

    const plugins = await marketplaceUpdates('plugin')
    expect([...plugins.latestByKey.keys()]).toEqual(['dues'])

    const themeUpdates = await marketplaceUpdates('theme')
    expect([...themeUpdates.latestByKey.keys()]).toEqual(['clubhouse'])
  })
})

describe('refreshMarketplaceNow', () => {
  it('refuses politely in fixture mode, with no repository to write to', async () => {
    dataSource.current = 'fixture'

    const result = await refreshMarketplaceNow()
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toContain('fixture')
  })
})

describe('currentFeedUrl', () => {
  it('reads the configured feed URL setting', async () => {
    expect(await currentFeedUrl()).toBe('https://www.meith.dev/marketplace/v1.json')
  })
})
