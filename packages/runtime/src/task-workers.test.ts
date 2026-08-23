import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryQueue } from '@meith/drivers'
import type { OutboxReader, OutboxRecord } from '@meith/events'
import type { MarketplaceFeed } from '@meith/marketplace'

import { buildEventRegistry } from './event-handlers'
import { defaultPromotionGuards, taskWorkers } from './task-workers'

const NOT_ABORTED = new AbortController().signal

class FakeOutbox implements OutboxReader {
  readonly marked: number[] = []
  constructor(private rows: OutboxRecord[]) {}

  async claimUnrelayed(limit: number): Promise<OutboxRecord[]> {
    const batch = this.rows.slice(0, limit)
    this.rows = this.rows.slice(limit)
    return batch
  }

  async markRelayed(ids: number[]): Promise<void> {
    this.marked.push(...ids)
  }
}

function postCreated(id: number, postId: number): OutboxRecord {
  return {
    id,
    name: 'post.created',
    payload: { postId, threadId: 20, forumId: 10, authorId: 1 },
    dedupeKey: null,
    createdAt: new Date(),
    relayedAt: null,
  }
}

const unusedDeps = {
  bans: {} as never,
  promotions: {} as never,
  guards: defaultPromotionGuards(),
  maintenance: {
    pruneSessions: async () => 0,
    pruneExpiredTokens: async () => 0,
  },
  recount: { run: async () => ({ corrected: 0 }) },
  threadViews: { flush: async () => 0 },
  renderBackfill: { run: async () => ({ rendered: 0 }) },
  warnings: null as never,
}

let rollUpAncestors: ReturnType<typeof vi.fn<(postId: number) => Promise<boolean>>>

function build(rows: OutboxRecord[]) {
  const queue = new MemoryQueue()
  const outbox = new FakeOutbox(rows)
  const workers = taskWorkers({
    ...unusedDeps,
    queue,
    outbox,
    events: buildEventRegistry({
      counters: { rollUpAncestors, applyVisibilityChange: async () => false },
    }),
  })
  return { queue, outbox, workers }
}

beforeEach(() => {
  rollUpAncestors = vi.fn(async () => true)
})

describe('the outbox relay and queue drain', () => {
  it('carries a committed event through to the counter roll-up', async () => {
    const { workers, outbox } = build([postCreated(1, 30)])

    expect(await workers.relayOutbox!(10)).toBe(1)
    expect(outbox.marked).toEqual([1])

    expect(await workers.drainQueue!(10, NOT_ABORTED)).toBe(1)
    expect(rollUpAncestors).toHaveBeenCalledWith(30)
  })

  it('stops draining when the task budget it was given is spent', async () => {
    const controller = new AbortController()
    rollUpAncestors = vi.fn(async () => {
      controller.abort()
      return true
    })

    const { queue, workers } = build([postCreated(1, 30), postCreated(2, 31), postCreated(3, 32)])
    await workers.relayOutbox!(10)

    expect(await workers.drainQueue!(10, controller.signal)).toBe(1)
    expect((await queue.pending()).length).toBe(2)
  })

  it('drops a job naming a handler this build does not have', async () => {
    const { queue, workers } = build([])
    await queue.enqueue('handler.removed.in.this.deploy', { postId: 1 })

    expect(await workers.drainQueue!(10, NOT_ABORTED)).toBe(1)
    expect(rollUpAncestors).not.toHaveBeenCalled()
  })

  it('relays nothing when the outbox is empty', async () => {
    const { workers } = build([])
    expect(await workers.relayOutbox!(10)).toBe(0)
  })

  it('reports what the recount corrected and what the flush moved', async () => {
    const queue = new MemoryQueue()
    const workers = taskWorkers({
      ...unusedDeps,
      queue,
      outbox: new FakeOutbox([]),
      events: buildEventRegistry({
        counters: { rollUpAncestors, applyVisibilityChange: async () => false },
      }),
      recount: { run: async () => ({ corrected: 7 }) },
      threadViews: { flush: async () => 4 },
    })

    expect(await workers.reconcileCounters!(500)).toBe(7)
    expect(await workers.flushThreadViews!(500)).toBe(4)
  })
})

describe('the statistics rollup', () => {
  function statsWorkers(online: number, tick: () => void = () => {}) {
    const calls: Array<{ count: number; at: Date }> = []
    const rolledAt: Date[] = []

    const workers = taskWorkers({
      ...unusedDeps,
      queue: new MemoryQueue(),
      outbox: new FakeOutbox([]),
      events: buildEventRegistry({
        counters: { rollUpAncestors, applyVisibilityChange: async () => false },
      }),
      statistics: {
        stats: {
          async rollUp(now: Date) {
            rolledAt.push(now)
            tick()
            return { memberCount: 42 }
          },
        },
        presence: {
          concurrentCount: async () => online,
          async recordIfHigher(count: number, at: Date) {
            calls.push({ count, at })
            return count > 10
          },
        },
      },
    })

    return { workers, calls, rolledAt }
  }

  it('offers the current count to the record rather than a stored one', async () => {
    const { workers, calls } = statsWorkers(17)

    const result = await workers.rollUpStatistics!()
    expect(calls.map((call) => call.count)).toEqual([17])
    expect(result).toEqual({ memberCount: 42, online: 17, record: true })
  })

  it('reports a record that did not move', async () => {
    const { workers } = statsWorkers(3)
    expect((await workers.rollUpStatistics!()).record).toBe(false)
  })

  it('stamps the rollup and the record with the same instant', async () => {
    vi.useFakeTimers()
    try {
      const { workers, calls, rolledAt } = statsWorkers(17, () => vi.advanceTimersByTime(5))

      await workers.rollUpStatistics!()
      expect(calls[0]?.at.getTime()).toBe(rolledAt[0]?.getTime())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('pruning the sign-in activity log', () => {
  const base = {
    ...unusedDeps,
    queue: new MemoryQueue(),
    outbox: new FakeOutbox([]),
    events: buildEventRegistry({
      counters: { rollUpAncestors: async () => true, applyVisibilityChange: async () => false },
    }),
  }

  it('reads nothing and deletes nothing while the board keeps its log forever', async () => {
    const pruneBefore = vi.fn(async () => 9)
    const workers = taskWorkers({
      ...base,
      authEvents: { retentionDays: async () => 0, pruneBefore },
    })

    expect(await workers.pruneAuthEvents!()).toBe(0)
    expect(pruneBefore).not.toHaveBeenCalled()
  })

  it('cuts at the retention the board is set to', async () => {
    const cutoffs: Date[] = []
    const workers = taskWorkers({
      ...base,
      authEvents: {
        retentionDays: async () => 30,
        pruneBefore: async (cutoff) => {
          cutoffs.push(cutoff)
          return 4
        },
      },
    })

    expect(await workers.pruneAuthEvents!()).toBe(4)

    const elapsed = Date.now() - cutoffs[0]!.getTime()
    expect(elapsed).toBeGreaterThan(29 * 86_400_000)
    expect(elapsed).toBeLessThan(31 * 86_400_000)
  })

  it('is absent, not a stub, on a board with no log to prune', async () => {
    const workers = taskWorkers(base)

    expect('pruneAuthEvents' in workers).toBe(false)
  })
})

describe('the search index backfill', () => {
  const base = {
    ...unusedDeps,
    queue: new MemoryQueue(),
    outbox: new FakeOutbox([]),
    events: buildEventRegistry({
      counters: { rollUpAncestors: async () => true, applyVisibilityChange: async () => false },
    }),
  }

  it('indexes a batch and reports how many it wrote', async () => {
    const calls: Array<[number, number]> = []
    const workers = taskWorkers({
      ...base,
      searchIndex: {
        reindexChunk: async (afterPostId, limit) => {
          calls.push([afterPostId, limit])
          return { indexed: 12 }
        },
      },
    })

    expect(await workers.reindexSearch!(200)).toBe(12)
    expect(calls).toEqual([[0, 200]])
  })

  it('is absent, not a stub, when there is no index to fill', async () => {
    const workers = taskWorkers(base)

    expect(workers.reindexSearch).toBeUndefined()
    expect('reindexSearch' in workers).toBe(false)
  })
})

describe('the marketplace catalog refresh', () => {
  const base = {
    ...unusedDeps,
    queue: new MemoryQueue(),
    outbox: new FakeOutbox([]),
    events: buildEventRegistry({
      counters: { rollUpAncestors: async () => true, applyVisibilityChange: async () => false },
    }),
  }

  function feed(listings: unknown[]) {
    return JSON.stringify({ schema: 'https://www.meith.dev/marketplace/v1.json#/schema', listings })
  }

  function listing(overrides: Record<string, unknown> = {}) {
    return {
      key: 'dues',
      kind: 'plugin',
      package: '@meith/plugin-dues',
      name: 'Dues',
      description: 'Paid memberships through Stripe.',
      screenshots: ['/marketplace/screenshots/dues-light.png'],
      version: '0.17.0',
      apiVersion: 0,
      meith: '>=0.16 <1',
      repository: 'https://github.com/meith-dev/meith',
      licence: 'LGPL-3.0-or-later',
      ...overrides,
    }
  }

  function fakeRepository() {
    const notified = new Set<string>()
    let saved: { feed: MarketplaceFeed | null; error: string | null } = { feed: null, error: null }
    return {
      async read() {
        return {
          feed: saved.feed,
          sourceUrl: null,
          fetchedAt: null,
          error: saved.error,
          errorAt: null,
        }
      },
      async saveFeed({ feed: f }: { feed: MarketplaceFeed; sourceUrl: string; fetchedAt: Date }) {
        saved = { feed: f, error: null }
      },
      async saveError({ message }: { message: string }) {
        saved = { ...saved, error: message }
      },
      async hasNotified(key: string, version: string) {
        return notified.has(`${key}@${version}`)
      },
      async markNotified(key: string, version: string) {
        notified.add(`${key}@${version}`)
      },
      get savedFeed() {
        return saved
      },
    }
  }

  it('fetches, caches and reports the listing count', async () => {
    const repository = fakeRepository()
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => feed([listing()]),
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    const workers = taskWorkers({
      ...base,
      marketplace: {
        repository,
        plugins: [{ key: 'dues', name: 'Dues', version: '0.16.0' }] as never,
        feedUrl: async () => 'https://example.com/v1.json',
        notifyUpdate: vi.fn(),
      },
    })

    const result = await workers.refreshMarketplaceCatalog!()
    expect(result).toMatchObject({ ok: true, listingCount: 1 })

    vi.unstubAllGlobals()
  })

  it('notifies exactly once for a plugin update, through the wired notifier', async () => {
    const repository = fakeRepository()
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => feed([listing({ version: '0.17.0' })]),
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    const notifyUpdate = vi.fn().mockResolvedValue(undefined)
    const workers = taskWorkers({
      ...base,
      marketplace: {
        repository,
        plugins: [{ key: 'dues', name: 'Dues', version: '0.16.0' }] as never,
        feedUrl: async () => 'https://example.com/v1.json',
        notifyUpdate,
      },
    })

    await workers.refreshMarketplaceCatalog!()
    await workers.refreshMarketplaceCatalog!()

    expect(notifyUpdate).toHaveBeenCalledTimes(1)
    expect(notifyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'dues', version: '0.17.0' }),
    )

    vi.unstubAllGlobals()
  })

  it('is absent, not a stub, when there is no catalog to refresh', () => {
    const workers = taskWorkers(base)

    expect(workers.refreshMarketplaceCatalog).toBeUndefined()
    expect('refreshMarketplaceCatalog' in workers).toBe(false)
  })
})
