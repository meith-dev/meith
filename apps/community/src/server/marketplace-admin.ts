import 'server-only'

import { env, logger, readPluginEnv } from '@meith/core'
import { getDb, PostgresMarketplaceCacheRepository } from '@meith/db'
import {
  type CachedMarketplace,
  computeListingStatus,
  EMPTY_CACHE,
  type InstalledEntry,
  type ListingKind,
  type ListingStatus,
  type MarketplaceListing,
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

function onStockImage(): boolean {
  return readPluginEnv('BOARD_PLUGINS_MANIFEST') !== undefined
}

const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500
const MAX_LICENCE_LENGTH = 100
const MAX_REASON_LENGTH = 300

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function safeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
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

export interface MarketplaceListingRow {
  readonly key: string
  readonly kind: ListingKind
  readonly name: string
  readonly description: string
  readonly version: string
  readonly package: string
  readonly licence: string
  readonly repositoryUrl: string | null
  readonly screenshotHrefs: readonly string[]
  readonly status: ListingStatus
  readonly incompatibleReason: string | null
  readonly installedVersion: string | null
  readonly installSteps: readonly string[] | null
  readonly onStockImage: boolean
}

export interface MarketplaceCatalogView {
  readonly listings: readonly MarketplaceListingRow[]
  readonly fetchedAt: Date | null
  readonly hasEverFetched: boolean
  readonly unreachable: boolean
  readonly errorMessage: string | null
}

function installSteps(kind: ListingKind, packageName: string): readonly string[] {
  return kind === 'plugin'
    ? [
        `npm install ${packageName}`,
        `community plugin:add ${packageName}`,
        'Rebuild and redeploy for it to take effect.',
      ]
    : [
        `npm install ${packageName}`,
        'Register it in community.config.ts (and set it as defaultTheme if it should be the board default).',
        'Rebuild and redeploy for it to take effect.',
      ]
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
    map.set(theme.key, { enabled: theme.enabled, version: null })
  }
  return map
}

function screenshotHref(listingKey: string, index: number): string {
  return `/admin/api/marketplace/screenshot?key=${encodeURIComponent(listingKey)}&index=${index}`
}

function toRow(
  listing: MarketplaceListing,
  installed: InstalledEntry | null,
): MarketplaceListingRow {
  const { status, incompatibleReason } = computeListingStatus({ ...listing, installed }, BUILD_INFO)

  return {
    key: listing.key,
    kind: listing.kind,
    name: truncate(listing.name, MAX_NAME_LENGTH),
    description: truncate(listing.description, MAX_DESCRIPTION_LENGTH),
    version: listing.version,
    package: listing.package,
    licence: truncate(listing.licence, MAX_LICENCE_LENGTH),
    repositoryUrl: safeHttpsUrl(listing.repository),
    screenshotHrefs: listing.screenshots.map((_, index) => screenshotHref(listing.key, index)),
    status,
    incompatibleReason:
      incompatibleReason === null ? null : truncate(incompatibleReason, MAX_REASON_LENGTH),
    installedVersion: installed?.version ?? null,
    installSteps: status === 'not-installed' ? installSteps(listing.kind, listing.package) : null,
    onStockImage: status === 'not-installed' && onStockImage(),
  }
}

export async function marketplaceCatalog(kind: ListingKind): Promise<MarketplaceCatalogView> {
  const cache = await readCache()
  const installed =
    kind === 'plugin' ? await pluginInstalledEntries() : await themeInstalledEntries()

  const listings = (cache.feed?.listings ?? [])
    .filter((listing) => listing.kind === kind)
    .map((listing) => toRow(listing, installed.get(listing.key) ?? null))

  return {
    listings,
    fetchedAt: cache.fetchedAt,
    hasEverFetched: cache.fetchedAt !== null,
    unreachable: cache.error !== null,
    errorMessage: cache.error,
  }
}

export async function marketplaceScreenshotUrl(key: string, index: number): Promise<string | null> {
  const cache = await readCache()
  if (cache.feed === null || cache.sourceUrl === null) return null

  const listing = cache.feed.listings.find((entry) => entry.key === key)
  const path = listing?.screenshots[index]
  if (path === undefined) return null

  try {
    return new URL(path, cache.sourceUrl).toString()
  } catch {
    return null
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
  const pluginEntries = await pluginInstalledEntries()
  const notifications = notificationService()

  const result = await refreshCatalog({
    url,
    repository,
    build: BUILD_INFO,
    resolveInstalled: (listing) =>
      listing.kind === 'plugin' ? (pluginEntries.get(listing.key) ?? null) : null,
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
        href: '/admin/plugins/browse',
        dedupeKey: `marketplace.update_available:${listing.key}:${listing.version}`,
      })
    },
  })

  return { ok: result.ok, listingCount: result.listingCount, errorMessage: result.error }
}

export async function currentFeedUrl(): Promise<string> {
  return (await getSettings()).get('marketplace.feed_url')
}
