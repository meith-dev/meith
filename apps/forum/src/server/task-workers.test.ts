/**
 * F38 — the event path from a committed outbox row to a moved counter.
 *
 * The pieces are each tested where they live: the reader against real Postgres,
 * the relay in `@forum/events`, the roll-up SQL against PGlite. What no other
 * test can see is whether they are *wired to each other* — that a relayed job's
 * `kind` is the handler id the drain looks up, and that the payload survives the
 * round trip. That seam is what this file covers, with a real queue.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryQueue } from '@forum/drivers'
import type { OutboxReader, OutboxRecord } from '@forum/events'

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
