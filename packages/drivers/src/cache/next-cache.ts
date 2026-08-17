import { revalidateTag } from 'next/cache'

import type { CacheDriver, CacheSetOptions } from '@meith/core'

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
    await this.local.invalidateTags(tags)

    for (const tag of tags) {
      revalidateTag(tag, 'max')
    }
  }
}
