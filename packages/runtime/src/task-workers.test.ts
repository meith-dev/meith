/**
 * F38 — the event path from a committed outbox row to a moved counter.
 *
 * The pieces are each tested where they live: the reader against real Postgres,
 * the relay in `@meith/events`, the roll-up SQL against PGlite. What no other
 * test can see is whether they are *wired to each other* — that a relayed job's
 * `kind` is the handler id the drain looks up, and that the payload survives the
 * round trip. That seam is what this file covers, with a real queue.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryQueue } from '@meith/drivers'
import type { OutboxReader, OutboxRecord } from '@meith/events'

import { buildEventRegistry } from './event-handlers'
import { defaultPromotionGuards, taskWorkers } from './task-workers'

/** An outbox that hands out rows once and remembers what was marked. */
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
    events: buildEventRegistry({ counters: { rollUpAncestors, applyVisibilityChange: async () => false } }),
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
    // Marked only after the enqueue returned — the ordering that makes a crash
    // in between re-deliver rather than lose the event.
    expect(outbox.marked).toEqual([1])

    expect(await workers.drainQueue!(10)).toBe(1)
    expect(rollUpAncestors).toHaveBeenCalledWith(30)
  })

  it('drops a job naming a handler this build does not have', async () => {
    const { queue, workers } = build([])
    await queue.enqueue('handler.removed.in.this.deploy', { postId: 1 })

    // A rolling deploy leaves these behind. Throwing would retry each one until
    // it dead-letters, which turns an expected condition into an alert.
    expect(await workers.drainQueue!(10)).toBe(1)
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
      events: buildEventRegistry({ counters: { rollUpAncestors, applyVisibilityChange: async () => false } }),
      recount: { run: async () => ({ corrected: 7 }) },
      threadViews: { flush: async () => 4 },
    })

    expect(await workers.reconcileCounters!(500)).toBe(7)
    expect(await workers.flushThreadViews!(500)).toBe(4)
  })
})

/**
 * F75. Two subjects on one tick, and the wiring is the whole claim: the record
 * is sampled from the *current* count, and both writes share one clock.
 */
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
    /*
     * Kills the mutant that passes the member count, or a zero, to
     * `recordIfHigher`. Both are numbers, both write successfully, and the
     * board would end up with a "most ever online" that is really its
     * membership — a wrong number nobody can tell is wrong.
     */
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
    /*
     * One `now` for both, so the record's timestamp and the totals'
     * `computed_at` cannot disagree about when this tick happened — which
     * matters when somebody is reading the run log to explain a number, the
     * only time anybody reads it.
     *
     * The clock is **advanced inside the rollup**, deliberately. A second
     * `new Date()` taken microseconds later is usually the same millisecond, so
     * without this the mutant that re-reads the clock passes by luck; moving
     * the fake timer between the two writes is what makes the difference
     * observable at all.
     */
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

/**
 * F72. The seam between "the tick wants a batch indexed" and the repository
 * that indexes one — untestable from either end, and the reason it matters is
 * that the failure it can produce is silent: a board whose search answers
 * nothing, with a task reporting healthy runs above it.
 */
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
    /*
     * From the start every run, on purpose. "What is left" is a predicate on
     * the row, so a cursor buys nothing across ticks and would be wrong the
     * moment a release moved the document and made an older post outstanding
     * again. Kills the mutant that threads a cursor through.
     */
    expect(calls).toEqual([[0, 200]])
  })

  it('is absent, not a stub, when there is no index to fill', async () => {
    /*
     * D32. A board with no database has no index, and `builtinTasks` reads the
     * *presence of the key* — so a worker returning 0 here would register
     * `search.reindex` and let it report a healthy run of nothing, for ever, on
     * a board where search cannot work at all.
     */
    const workers = taskWorkers(base)

    expect(workers.reindexSearch).toBeUndefined()
    expect('reindexSearch' in workers).toBe(false)
  })
})
