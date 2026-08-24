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
    licence: 'LGPL-3.0-or-later',
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
    licence: 'LGPL-3.0-or-later',
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

const { marketplaceCatalog, marketplaceScreenshotUrl, refreshMarketplaceNow, currentFeedUrl } =
  await import('./marketplace-admin')

beforeEach(() => {
  dataSource.current = 'postgres'
  cache.current = { feed: null, sourceUrl: null, fetchedAt: null, error: null, errorAt: null }
  configuredPlugins.current = []
  themes.current = []
  repositoryCalls.saveFeed = []
  repositoryCalls.saveError = []
  notifyMock.mockReset()
})

describe('marketplaceCatalog', () => {
  it('reports "not fetched yet" before any fetch has ever succeeded', async () => {
    const result = await marketplaceCatalog('plugin')
    expect(result).toMatchObject({ hasEverFetched: false, unreachable: false, listings: [] })
  })

  it('reports unreachable when the cache carries an error', async () => {
    cache.current = {
      feed: null,
      sourceUrl: null,
      fetchedAt: null,
      error: 'could not reach the host',
      errorAt: '2026-01-01T00:00:00Z',
    }

    const result = await marketplaceCatalog('plugin')
    expect(result.unreachable).toBe(true)
    expect(result.errorMessage).toBe('could not reach the host')
  })

  it('filters listings by kind', async () => {
    cache.current = {
      feed: {
        schema: 'x',
        listings: [pluginListing(), themeListingEntry()],
      },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const plugins = await marketplaceCatalog('plugin')
    expect(plugins.listings.map((row) => row.key)).toEqual(['dues'])

    const themeRows = await marketplaceCatalog('theme')
    expect(themeRows.listings.map((row) => row.key)).toEqual(['clubhouse'])
  })

  it('reports "active" for an installed, enabled plugin at the listed version', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: true, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.status).toBe('active')
    expect(row?.installedVersion).toBe('0.16.0')
    expect(row?.installSteps).toBeNull()
  })

  it('reports "installed-disabled" for a disabled plugin', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: false, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.status).toBe('installed-disabled')
  })

  it('reports "not-installed" with install steps for a plugin this board never registered', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.status).toBe('not-installed')
    expect(row?.installSteps).toEqual([
      'pnpm add @meith/plugin-dues --filter @meith/web',
      'community plugin:add @meith/plugin-dues',
      'Rebuild and redeploy for it to take effect.',
    ])
    expect(row?.onStockImage).toBe(false)
  })

  it('flags "not-installed" as onStockImage when BOARD_PLUGINS_MANIFEST is set — docker/Dockerfile\'s own signal', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }
    process.env.BOARD_PLUGINS_MANIFEST = '/app/board.plugins.json'
    try {
      const [row] = (await marketplaceCatalog('plugin')).listings
      expect(row?.onStockImage).toBe(true)
    } finally {
      delete process.env.BOARD_PLUGINS_MANIFEST
    }
  })

  it('never flags an installed, active listing as onStockImage', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: true, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }
    process.env.BOARD_PLUGINS_MANIFEST = '/app/board.plugins.json'
    try {
      const [row] = (await marketplaceCatalog('plugin')).listings
      expect(row?.status).toBe('active')
      expect(row?.onStockImage).toBe(false)
    } finally {
      delete process.env.BOARD_PLUGINS_MANIFEST
    }
  })

  it('reports "update-available" when the feed lists a newer, compatible version', async () => {
    configuredPlugins.current = [
      { key: 'dues', enabled: true, hasDefinition: true, name: 'Dues', version: '0.16.0' },
    ]
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing({ version: '0.17.0' })] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.status).toBe('update-available')
  })

  it('reports "incompatible" and explains why, without offering install steps', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing({ apiVersion: 9 })] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.status).toBe('incompatible')
    expect(row?.incompatibleReason).not.toBeNull()
    expect(row?.installSteps).toBeNull()
  })

  it('caps an incompatibility reason built from an untrusted, unbounded "meith" range', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing({ meith: `>=${'9'.repeat(10_000)}` })] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.status).toBe('incompatible')
    expect(row?.incompatibleReason?.length).toBeLessThan(400)
  })

  it('reports "active" for an enabled, installed theme', async () => {
    themes.current = [{ key: 'clubhouse', enabled: true }]
    cache.current = {
      feed: { schema: 'x', listings: [themeListingEntry()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('theme')).listings
    expect(row?.status).toBe('active')
  })

  it('caps a description far longer than the feed schema requires', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing({ description: 'x'.repeat(10_000) })] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.description.length).toBeLessThan(600)
  })

  it('refuses to render a non-https repository as a link', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing({ repository: 'javascript:alert(1)' })] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.repositoryUrl).toBeNull()
  })

  it('builds same-origin screenshot hrefs rather than the feed host directly', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    const [row] = (await marketplaceCatalog('plugin')).listings
    expect(row?.screenshotHrefs).toEqual(['/admin/api/marketplace/screenshot?key=dues&index=0'])
  })
})

describe('marketplaceScreenshotUrl', () => {
  it('resolves a screenshot path against the feed source, not the current setting', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://mirror.example/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    expect(await marketplaceScreenshotUrl('dues', 0)).toBe(
      'https://mirror.example/marketplace/screenshots/dues-light.png',
    )
  })

  it('returns null for an unknown listing or an out-of-range index', async () => {
    cache.current = {
      feed: { schema: 'x', listings: [pluginListing()] },
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
      error: null,
      errorAt: null,
    }

    expect(await marketplaceScreenshotUrl('nope', 0)).toBeNull()
    expect(await marketplaceScreenshotUrl('dues', 5)).toBeNull()
  })

  it('returns null before anything has ever been cached', async () => {
    expect(await marketplaceScreenshotUrl('dues', 0)).toBeNull()
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
