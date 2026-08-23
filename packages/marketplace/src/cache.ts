import type { MarketplaceFeed } from './schema'

export interface CachedMarketplace {
  readonly feed: MarketplaceFeed | null
  /** The feed URL `feed` was actually fetched from — a listing's screenshot
   *  path is resolved against this, not against today's setting. */
  readonly sourceUrl: string | null
  readonly fetchedAt: Date | null
  readonly error: string | null
  readonly errorAt: Date | null
}

export const EMPTY_CACHE: CachedMarketplace = {
  feed: null,
  sourceUrl: null,
  fetchedAt: null,
  error: null,
  errorAt: null,
}

/**
 * The cached feed and the daily task's own bookkeeping — one row, whichever
 * infrastructure package backs it (see packages/db's `marketplace-repo.ts`).
 * `hasNotified`/`markNotified` are what make an update notify administrators
 * exactly once per (plugin, version), ever: independent of whether the
 * notification itself has since been read, which a bare `dedupeKey` on the
 * notification service is not (its coalescing only holds while a
 * notification is unread — see packages/notifications).
 */
export interface MarketplaceCacheRepository {
  read(): Promise<CachedMarketplace>
  saveFeed(input: {
    readonly feed: MarketplaceFeed
    readonly sourceUrl: string
    readonly fetchedAt: Date
  }): Promise<void>
  saveError(input: { readonly message: string; readonly at: Date }): Promise<void>
  hasNotified(key: string, version: string): Promise<boolean>
  markNotified(key: string, version: string): Promise<void>
}
