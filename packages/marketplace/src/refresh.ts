import type { MarketplaceCacheRepository } from './cache'
import { fetchMarketplaceFeed } from './fetch'
import type { MarketplaceListing } from './schema'
import { validateFeed } from './schema'
import { type BuildInfo, computeListingStatus, type InstalledEntry } from './status'

export interface RefreshCatalogInput {
  readonly url: string
  readonly repository: MarketplaceCacheRepository
  readonly build: BuildInfo
  /** How this build resolves a listing's key against what it compiled in. */
  readonly resolveInstalled: (listing: MarketplaceListing) => InstalledEntry | null
  /**
   * Called once per newly-detected (plugin, version) update, after it has
   * already been claimed as notified — see docs/customization/marketplace.md for why the
   * claim happens first, and what that means if this throws.
   */
  readonly notifyUpdate: (listing: MarketplaceListing) => Promise<void>
  readonly now?: () => Date
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

export interface RefreshCatalogResult {
  readonly ok: boolean
  readonly listingCount: number
  readonly notified: number
  readonly error: string | null
}

/**
 * Fetches, validates and caches the feed, then raises the update
 * notification for any plugin whose new version this board has not already
 * notified about. This is the one function both the daily task and the
 * admin "Refresh" button call — see docs/customization/marketplace.md — so there is
 * exactly one place that decides what counts as a successful refresh, and
 * the two can run concurrently: `claimNotified` is what keeps a race between
 * them from raising the same (plugin, version) update twice.
 */
export async function refreshCatalog(input: RefreshCatalogInput): Promise<RefreshCatalogResult> {
  const now = input.now ?? (() => new Date())

  const fetched = await fetchMarketplaceFeed({
    url: input.url,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  })

  if (!fetched.ok) {
    const message = fetched.error ?? 'unknown fetch error'
    await input.repository.saveError({ message, at: now() })
    return { ok: false, listingCount: 0, notified: 0, error: message }
  }

  const validated = validateFeed(fetched.body)
  if (!validated.ok) {
    const message = `feed failed validation: ${validated.errors.slice(0, 5).join('; ')}`
    await input.repository.saveError({ message, at: now() })
    return { ok: false, listingCount: 0, notified: 0, error: message }
  }

  await input.repository.saveFeed({ feed: validated.feed, sourceUrl: input.url, fetchedAt: now() })

  let notified = 0
  for (const listing of validated.feed.listings) {
    if (listing.kind !== 'plugin') continue

    const installed = input.resolveInstalled(listing)
    const result = computeListingStatus({ ...listing, installed }, input.build)
    if (result.status !== 'update-available') continue
    if (!(await input.repository.claimNotified(listing.key, listing.version))) continue

    await input.notifyUpdate(listing)
    notified += 1
  }

  return { ok: true, listingCount: validated.feed.listings.length, notified, error: null }
}
