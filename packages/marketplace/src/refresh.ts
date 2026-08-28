import type { MarketplaceCacheRepository } from './cache'
import { fetchMarketplaceFeed } from './fetch'
import type { MarketplaceListing } from './schema'
import { validateFeed } from './schema'
import { type BuildInfo, computeListingStatus, type InstalledEntry } from './status'

export interface RefreshCatalogInput {
  readonly url: string
  readonly repository: MarketplaceCacheRepository
  readonly build: BuildInfo
  readonly resolveInstalled: (listing: MarketplaceListing) => InstalledEntry | null
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
    const installed = input.resolveInstalled(listing)
    const result = computeListingStatus({ ...listing, installed }, input.build)
    if (result.status !== 'update-available') continue
    if (!(await input.repository.claimNotified(listing.key, listing.version))) continue

    await input.notifyUpdate(listing)
    notified += 1
  }

  return { ok: true, listingCount: validated.feed.listings.length, notified, error: null }
}
