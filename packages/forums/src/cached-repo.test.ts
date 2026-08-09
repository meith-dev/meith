import { CacheTags, type CacheDriver, type CacheSetOptions } from '@meith/core'
import { describe, expect, it, vi } from 'vitest'

import { CachedForumRepository, TREE_TTL_SECONDS } from './cached-repo'
import type { ForumRepository } from './ports'
import type { ForumRow } from './types'

interface Entry {
  value: unknown
  tags: readonly string[]
  /** Epoch ms, or absent for "until invalidated". */
  expiresAt?: number
}

/**
 * A driver that honours `ttlSeconds`, because the real ones do.
 *
 * It did not, and the omission would have made the tree's expiry untestable
 * here — the one property protecting this cache from a writer in another
 * process. Expiry is a read-side miss rather than a sweep, exactly as
 * `MemoryCache` implements it.
 */
function cacheDriver(): CacheDriver {
  const entries = new Map<string, Entry>()
  return {
    get: <T>(k: string) => {
      const entry = entries.get(k)
      if (entry === undefined) return Promise.resolve(undefined)
      if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
        entries.delete(k)
        return Promise.resolve(undefined)
      }
      return Promise.resolve(entry.value as T)
    },
    set: <T>(k: string, v: T, o: CacheSetOptions = {}) => {
      entries.set(k, {
        value: v,
        tags: o.tags ?? [],
        ...(o.ttlSeconds === undefined ? {} : { expiresAt: Date.now() + o.ttlSeconds * 1000 }),
      })
      return Promise.resolve()
    },
    delete: (k: string) => {
      entries.delete(k)
      return Promise.resolve()
    },
    invalidateTags: (tags: readonly string[]) => {
      const wanted = new Set(tags)
      for (const [k, e] of entries) if (e.tags.some((t) => wanted.has(t))) entries.delete(k)
      return Promise.resolve()
    },
  }
}

function row(id: number): ForumRow {
  return {
    id,
    parentId: null,
    displayOrder: 0,
    path: String(id),
    depth: 0,
    type: 'forum',
    title: `F${id}`,
    slug: `f-${id}`,
    description: null,
    linkUrl: null,
  }
}

function innerRepo(
  rows: ForumRow[],
): ForumRepository & {
  listAll: ReturnType<typeof vi.fn>
  listListing: ReturnType<typeof vi.fn>
} {
  /*
   * A copy per call, like a query. Returning the array itself would let a test
   * that appends a row afterwards mutate the value the cache is holding — the
   * cached tree would update itself, and the staleness these tests are about
   * would be invisible.
   */
  const listAll = vi.fn().mockImplementation(() => Promise.resolve([...rows]))
  const listListing = vi.fn().mockImplementation(() =>
    Promise.resolve(rows.map((r) => ({ ...r, threadCount: 0, postCount: 0, lastPost: null }))),
  )
  const repo: ForumRepository = {
    listAll: listAll as unknown as ForumRepository['listAll'],
    listListing: listListing as unknown as ForumRepository['listListing'],
    findById: (id: number) => Promise.resolve(rows.find((r) => r.id === id) ?? null),
    create: (input) =>
      Promise.resolve({ ...rows[0], ...input, id: 999, path: '999', depth: 0 } as ForumRow),
    applyMove: () => Promise.resolve(),
    move: () => Promise.resolve(),
  }
  return Object.assign(repo, { listAll, listListing })
}

describe('CachedForumRepository', () => {
  it('queries once and serves the rest from cache', async () => {
    const inner = innerRepo([row(1), row(2)])
    const repo = new CachedForumRepository(inner, cacheDriver())

    await repo.listAll()
    await repo.listAll()
    await repo.listAll()
    expect(inner.listAll).toHaveBeenCalledTimes(1)
  })

  it('serves findById from the same entry, adding no query', async () => {
    const inner = innerRepo([row(1), row(2)])
    const repo = new CachedForumRepository(inner, cacheDriver())

    await repo.listAll()
    expect((await repo.findById(2))?.id).toBe(2)
    expect(await repo.findById(99)).toBeNull()
    expect(inner.listAll).toHaveBeenCalledTimes(1)
  })

  it('refetches after a move invalidates the tree', async () => {
    const inner = innerRepo([row(1)])
    const repo = new CachedForumRepository(inner, cacheDriver())

    await repo.listAll()
    await repo.move(1, { newParentId: null })
    await repo.listAll()

    // Without invalidation this stays at 1 and the ACP shows a stale tree.
    expect(inner.listAll).toHaveBeenCalledTimes(2)
  })

  it('invalidates after applyMove too', async () => {
    const inner = innerRepo([row(1)])
    const repo = new CachedForumRepository(inner, cacheDriver())

    await repo.listAll()
    await repo.applyMove({ forumId: 1, newParentId: null, pathUpdates: [], orderUpdates: [] })
    await repo.listAll()
    expect(inner.listAll).toHaveBeenCalledTimes(2)
  })

  /*
   * Ordering matters: invalidating before the write leaves a window where a
   * concurrent read repopulates from the pre-write state and nothing clears it
   * again. This pins the write-then-invalidate order.
   */
  it('invalidates after the write, not before', async () => {
    const order: string[] = []
    const cache = cacheDriver()
    const inner = innerRepo([row(1)])
    inner.move = () => {
      order.push('write')
      return Promise.resolve()
    }
    const originalInvalidate = cache.invalidateTags.bind(cache)
    cache.invalidateTags = (tags) => {
      order.push('invalidate')
      return originalInvalidate(tags)
    }

    await new CachedForumRepository(inner, cache).move(1, { newParentId: null })
    expect(order).toEqual(['write', 'invalidate'])
  })

  it('stores the entry under the forum-tree tag, and with an expiry', async () => {
    const cache = cacheDriver()
    const set = vi.spyOn(cache, 'set')

    await new CachedForumRepository(innerRepo([row(1)]), cache).listAll()
    expect(set).toHaveBeenCalledWith(expect.any(String), [row(1)], {
      tags: [CacheTags.forumTree()],
      ttlSeconds: TREE_TTL_SECONDS,
    })
  })

  /*
   * The expiry is not belt-and-braces on top of invalidation; it is the only
   * protection against a writer this process cannot see. `community
   * forum:create`, the importer and the installer all write forums without going
   * through this class, and a second web instance holds its own copy of the map.
   *
   * The failure it ends is D117's, and the shape below is exactly that board: a
   * tree cached while the board had no forums, a forum inserted behind the
   * decorator's back, and `findById` — which the composer, the thread page, the
   * feed and the REST reads all go through — answering "no such forum" for the
   * life of the process. The index went on working the whole time, because
   * `listListing()` is uncached.
   */
  it('sees a forum written behind its back, once the entry expires', async () => {
    vi.useFakeTimers()
    try {
      const rows: ForumRow[] = []
      const inner = innerRepo(rows)
      const repo = new CachedForumRepository(inner, cacheDriver())

      /* Somebody loads the board before it has a forum. */
      expect(await repo.findById(2)).toBeNull()

      /* The installer creates one, through a repository that is not this one. */
      rows.push(row(2))

      /* Still absent: nothing told this process. This was the 404. */
      expect(await repo.findById(2)).toBeNull()

      vi.advanceTimersByTime(TREE_TTL_SECONDS * 1000 + 1)
      expect((await repo.findById(2))?.id).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  /*
   * The listing read carries counters that change on every post. Caching it
   * under the forum-tree tag would mean invalidating the tree on every reply,
   * making the tag worthless for the structural read it exists to serve; caching
   * it under a tag of its own means an entry that is stale within seconds and a
   * second thing the posting path must remember to clear.
   *
   * Both of those are easy to "fix" by adding two lines to the decorator, which
   * is exactly why the decision is pinned by a test rather than left as a
   * comment. See ForumRepository.listListing.
   */
  it('never caches the listing read', async () => {
    const cache = cacheDriver()
    const set = vi.spyOn(cache, 'set')
    const inner = innerRepo([row(1)])
    const repo = new CachedForumRepository(inner, cache)

    await repo.listListing()
    await repo.listListing()

    expect(inner.listListing).toHaveBeenCalledTimes(2)
    expect(set).not.toHaveBeenCalled()
  })

  it('does not serve the listing read from the cached tree', async () => {
    const cache = cacheDriver()
    const inner = innerRepo([row(1)])
    const repo = new CachedForumRepository(inner, cache)

    // Populate the structural cache first: a decorator that answered the
    // listing read from it would return rows with no counters at all.
    await repo.listAll()
    const listing = await repo.listListing()

    expect(listing[0]).toHaveProperty('threadCount')
    expect(inner.listListing).toHaveBeenCalledTimes(1)
  })
})
