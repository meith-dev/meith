import 'server-only'

import { env, logger } from '@meith/core'
import { getDb, PostgresMarketplaceCacheRepository } from '@meith/db'
import {
  type CachedMarketplace,
  computeListingStatus,
  EMPTY_CACHE,
  type InstalledEntry,
  type ListingKind,
  MEITH_VERSION,
  PLUGIN_API_MAJOR,
  refreshCatalog,
  THEME_API_MAJOR,
} from '@meith/marketplace'

import { notificationService } from './notifications'
import { configuredPlugins } from './plugin-host'
import { getSettings, getSettingsUncached } from './settings'
import { themeListing } from './theme-admin'

const BUILD_INFO = {
  meithVersion: MEITH_VERSION,
  pluginApiMajor: PLUGIN_API_MAJOR,
  themeApiMajor: THEME_API_MAJOR,
}

export function marketplaceCacheRepository(): PostgresMarketplaceCacheRepository | null {
  return env.DATA_SOURCE === 'postgres' ? new PostgresMarketplaceCacheRepository(getDb()) : null
}

async function readCache(): Promise<CachedMarketplace> {
  const repository = marketplaceCacheRepository()
  if (repository === null) return EMPTY_CACHE

  try {
    return await repository.read()
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read the cached marketplace feed')
    return EMPTY_CACHE
  }
}

async function pluginInstalledEntries(): Promise<ReadonlyMap<string, InstalledEntry>> {
  const map = new Map<string, InstalledEntry>()
  for (const plugin of configuredPlugins()) {
    if (!plugin.hasDefinition || plugin.version === null) continue
    map.set(plugin.key, { enabled: plugin.enabled, version: plugin.version })
  }
  return map
}

async function themeInstalledEntries(): Promise<ReadonlyMap<string, InstalledEntry>> {
  const map = new Map<string, InstalledEntry>()
  for (const theme of await themeListing()) {
    map.set(theme.key, { enabled: theme.enabled, version: theme.version })
  }
  return map
}

export interface MarketplaceUpdatesView {
  readonly latestByKey: ReadonlyMap<string, string>
  readonly fetchedAt: Date | null
  readonly hasEverFetched: boolean
  readonly unreachable: boolean
}

export async function marketplaceUpdates(kind: ListingKind): Promise<MarketplaceUpdatesView> {
  const cache = await readCache()
  const installed =
    kind === 'plugin' ? await pluginInstalledEntries() : await themeInstalledEntries()

  const latestByKey = new Map<string, string>()
  for (const listing of cache.feed?.listings ?? []) {
    if (listing.kind !== kind) continue
    const entry = installed.get(listing.key)
    if (entry === undefined) continue

    const { status } = computeListingStatus({ ...listing, installed: entry }, BUILD_INFO)
    if (status === 'update-available') latestByKey.set(listing.key, listing.version)
  }

  return {
    latestByKey,
    fetchedAt: cache.fetchedAt,
    hasEverFetched: cache.fetchedAt !== null,
    unreachable: cache.error !== null,
  }
}

export async function refreshMarketplaceNow(): Promise<{
  readonly ok: boolean
  readonly listingCount: number
  readonly errorMessage: string | null
}> {
  const repository = marketplaceCacheRepository()
  if (repository === null) {
    return { ok: false, listingCount: 0, errorMessage: 'This board is running in fixture mode.' }
  }

  const url = (await getSettingsUncached()).get('marketplace.feed_url')
  const [pluginEntries, themeEntries] = await Promise.all([
    pluginInstalledEntries(),
    themeInstalledEntries(),
  ])
  const notifications = notificationService()

  const result = await refreshCatalog({
    url,
    repository,
    build: BUILD_INFO,
    resolveInstalled: (listing) =>
      (listing.kind === 'plugin' ? pluginEntries : themeEntries).get(listing.key) ?? null,
    notifyUpdate: async (listing) => {
      if (notifications === null) return
      await notifications.raiseForAdministrators({
        kind: 'marketplace.update_available',
        data: {
          key: listing.key,
          name: listing.name,
          package: listing.package,
          version: listing.version,
        },
        href: listing.kind === 'plugin' ? '/admin/plugins' : '/admin/themes',
        dedupeKey: `marketplace.update_available:${listing.key}:${listing.version}`,
      })
    },
  })

  return { ok: result.ok, listingCount: result.listingCount, errorMessage: result.error }
}

export async function currentFeedUrl(): Promise<string> {
  return (await getSettings()).get('marketplace.feed_url')
}
