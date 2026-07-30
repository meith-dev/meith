/**
 * Process-local cache with tag invalidation.
 *
 * Correct for per-request memoisation and for user-scoped values that must never
 * be shared (F10 keeps those out of the Next data cache deliberately). Not
 * coherent across instances: two serverless instances hold independent maps, so
 * anything requiring board-wide consistency belongs in NextCacheDriver or Redis.
 */

import type { CacheDriver, CacheSetOptions } from '@forum/core'

interface Entry {
  value: unknown
  /** Epoch ms, or undefined for "until invalidated". */
  expiresAt?: number
  tags: readonly string[]
}

export class MemoryCache implements CacheDriver {
  private readonly entries = new Map<string, Entry>()

  /**
   * Bounded to stop a long-lived worker turning the cache into a leak. Eviction
   * is insertion-order (Map iteration order), which approximates FIFO — good
   * enough here, and honest about not being LRU.
   */
  constructor(private readonly maxEntries = 5000) {}

  get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key)
    if (!entry) return Promise.resolve(undefined)

    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return Promise.resolve(undefined)
    }
    return Promise.resolve(entry.value as T)
  }

  set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }

    const entry: Entry = { value, tags: options.tags ?? [] }
    if (options.ttlSeconds !== undefined) {
      entry.expiresAt = Date.now() + options.ttlSeconds * 1000
    }
    this.entries.set(key, entry)
    return Promise.resolve()
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key)
    return Promise.resolve()
  }

  invalidateTags(tags: readonly string[]): Promise<void> {
    if (tags.length === 0) return Promise.resolve()
    const wanted = new Set(tags)

    for (const [key, entry] of this.entries) {
      if (entry.tags.some((t) => wanted.has(t))) this.entries.delete(key)
    }
    return Promise.resolve()
  }

  /* ---- test helpers ---- */

  size(): number {
    return this.entries.size
  }

  reset(): void {
    this.entries.clear()
  }
}
