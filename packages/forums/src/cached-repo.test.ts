import { CacheTags, type CacheDriver, type CacheSetOptions } from '@meith/core'
import { describe, expect, it, vi } from 'vitest'

import { CachedForumRepository } from './cached-repo'
import type { ForumRepository } from './ports'
import type { ForumRow } from './types'

function cacheDriver(): CacheDriver {
  const entries = new Map<string, { value: unknown; tags: readonly string[] }>()
  return {
    get: <T>(k: string) => Promise.resolve(entries.get(k)?.value as T | undefined),
    set: <T>(k: string, v: T, o: CacheSetOptions = {}) => {
      entries.set(k, { value: v, tags: o.tags ?? [] })
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
  const listAll = vi.fn().mockImplementation(() => Promise.resolve(rows))
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

  it('stores the entry under the forum-tree tag', async () => {
    const cache = cacheDriver()
    const set = vi.spyOn(cache, 'set')

    await new CachedForumRepository(innerRepo([row(1)]), cache).listAll()
    expect(set).toHaveBeenCalledWith(expect.any(String), [row(1)], {
      tags: [CacheTags.forumTree()],
    })
  })

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

    await repo.listAll()
    const listing = await repo.listListing()

    expect(listing[0]).toHaveProperty('threadCount')
    expect(inner.listListing).toHaveBeenCalledTimes(1)
  })
})
