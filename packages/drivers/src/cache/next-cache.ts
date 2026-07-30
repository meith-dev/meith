/**
 * Cache driver backed by Next's data cache (F10).
 *
 * Read the shape of this carefully, because it is not a KV store and pretending
 * otherwise is how cache bugs get shipped.
 *
 * Next's cache is *declarative*: you tag a cached function with
 * `unstable_cache`/`use cache`, and `revalidateTag` purges it across every
 * instance and the CDN. There is no imperative `set(key, value)` that
 * participates in it. So:
 *
 * - `invalidateTags` is the real, distributed operation — the reason this driver
 *   exists and the only correct way to purge board-wide cached data.
 * - `get`/`set` fall through to a process-local `MemoryCache`. They are honest
 *   per-instance memoisation and are NOT coherent across instances.
 *
 * Anything that must be globally consistent should be a tagged cached function
 * purged through `invalidateTags`, never `set()`.
 *
 * Per R2 this package may import `next`; domain packages may not, which is why
 * this file lives here and not in `@forum/forums`.
 */

import type { CacheDriver, CacheSetOptions } from '@forum/core'
import { revalidateTag } from 'next/cache'

import { MemoryCache } from './memory-cache'

export class NextCacheDriver implements CacheDriver {
  private readonly local = new MemoryCache()

  get<T>(key: string): Promise<T | undefined> {
    return this.local.get<T>(key)
  }

  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    return this.local.set(key, value, options)
  }

  delete(key: string): Promise<void> {
    return this.local.delete(key)
  }

  async invalidateTags(tags: readonly string[]): Promise<void> {
    // Local copies first: a stale in-process entry would outlive the purge.
    await this.local.invalidateTags(tags)

    for (const tag of tags) {
      /*
       * Next 16 requires a cacheLife profile as the second argument, which
       * enables stale-while-revalidate rather than a hard purge. 'max' is the
       * recommended default: readers keep serving the stale value while the
       * refresh happens behind them, so an invalidation never becomes a
       * thundering herd against the database.
       */
      revalidateTag(tag, 'max')
    }
  }
}
