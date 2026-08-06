import { describe, expect, it, vi } from 'vitest'

import { CacheTags, cachedGlobal, globalCacheKey } from './cache'
import type { CacheDriver, CacheSetOptions } from './ports'

function fakeCache(): CacheDriver & { entries: Map<string, { value: unknown; tags: readonly string[] }> } {
  const entries = new Map<string, { value: unknown; tags: readonly string[] }>()
  return {
    entries,
    get: <T>(key: string) => Promise.resolve(entries.get(key)?.value as T | undefined),
    set: <T>(key: string, value: T, options: CacheSetOptions = {}) => {
      entries.set(key, { value, tags: options.tags ?? [] })
      return Promise.resolve()
    },
    delete: (key: string) => {
      entries.delete(key)
      return Promise.resolve()
    },
    invalidateTags: (tags: readonly string[]) => {
      const wanted = new Set(tags)
      for (const [k, e] of entries) if (e.tags.some((t) => wanted.has(t))) entries.delete(k)
      return Promise.resolve()
    },
  }
}

const US = '\u001f'

describe('globalCacheKey', () => {
  it('joins parts', () => {
    expect(globalCacheKey(['forum-tree'])).toBe('forum-tree')
    expect(globalCacheKey(['forum', 12])).toBe(`forum${US}12`)
  })

  it('refuses an empty key', () => {
    expect(() => globalCacheKey([])).toThrow()
  })

  it('refuses a part containing the separator', () => {
    expect(() => globalCacheKey([`forum${US}1`, '2'])).toThrow(/separator/)
  })

  it('keeps ordinary punctuation usable in a key part', () => {
    expect(globalCacheKey(['theme:midnight', 'v2'])).toBe(`theme:midnight${US}v2`)
  })
})

describe('cachedGlobal', () => {
  const opts = { key: ['forum-tree'], tags: [CacheTags.forumTree()] }

  it('runs the loader once and serves the rest from cache', async () => {
    const cache = fakeCache()
    const load = vi.fn().mockResolvedValue(['a', 'b'])

    expect(await cachedGlobal(cache, opts, load)).toEqual(['a', 'b'])
    expect(await cachedGlobal(cache, opts, load)).toEqual(['a', 'b'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('stores the entry under its tags so invalidation reaches it', async () => {
    const cache = fakeCache()
    const load = vi.fn().mockResolvedValue('v1')

    await cachedGlobal(cache, opts, load)
    await cache.invalidateTags([CacheTags.forumTree()])

    load.mockResolvedValue('v2')
    expect(await cachedGlobal(cache, opts, load)).toBe('v2')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('refuses to cache anything untagged', async () => {
    const cache = fakeCache()
    await expect(
      cachedGlobal(cache, { key: ['x'], tags: [] }, async () => 1),
    ).rejects.toThrow(/at least one tag/)
  })

  it('does not store undefined, which the driver reads back as a miss', async () => {
    const cache = fakeCache()
    const load = vi.fn().mockResolvedValue(undefined)

    await cachedGlobal(cache, opts, load)
    expect(cache.entries.size).toBe(0)

    await cachedGlobal(cache, opts, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('passes revalidate through as a TTL', async () => {
    const cache = fakeCache()
    const set = vi.spyOn(cache, 'set')

    await cachedGlobal(cache, { ...opts, revalidate: 30 }, async () => 'v')
    expect(set).toHaveBeenCalledWith('forum-tree', 'v', {
      tags: [CacheTags.forumTree()],
      ttlSeconds: 30,
    })
  })

  it('omits ttlSeconds entirely when no revalidate is given', async () => {
    const cache = fakeCache()
    const set = vi.spyOn(cache, 'set')

    await cachedGlobal(cache, opts, async () => 'v')
    expect(set).toHaveBeenCalledWith('forum-tree', 'v', { tags: [CacheTags.forumTree()] })
  })
})
