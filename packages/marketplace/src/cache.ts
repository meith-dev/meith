import type { MarketplaceFeed } from './schema'

export interface CachedMarketplace {
  readonly feed: MarketplaceFeed | null
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

export interface MarketplaceCacheRepository {
  read(): Promise<CachedMarketplace>
  saveFeed(input: {
    readonly feed: MarketplaceFeed
    readonly sourceUrl: string
    readonly fetchedAt: Date
  }): Promise<void>
  saveError(input: { readonly message: string; readonly at: Date }): Promise<void>
  claimNotified(key: string, version: string): Promise<boolean>
}
