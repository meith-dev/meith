import { describe, expect, it } from 'vitest'

import { emit, type OutboxReader, type RelayTarget, relayOutbox } from './outbox'
import type { OutboxRecord } from './types'

class FakeOutbox implements OutboxReader, RelayTarget {
  rows: OutboxRecord[] = []
  enqueued: Array<{ name: string; idempotencyKey: string }> = []
  private nextId = 1

  async insertOutbox(
    rows: Array<{ name: string; payload: unknown; dedupeKey: string | null }>,
  ): Promise<void> {
    for (const row of rows) {
      if (row.dedupeKey && this.rows.some((r) => r.dedupeKey === row.dedupeKey)) {
        continue
      }
      this.rows.push({
        id: this.nextId++,
        name: row.name as OutboxRecord['name'],
        payload: row.payload,
        dedupeKey: row.dedupeKey,
        createdAt: new Date(),
        relayedAt: null,
      })
    }
  }

  async claimUnrelayed(limit: number): Promise<OutboxRecord[]> {
    return this.rows.filter((r) => r.relayedAt === null).slice(0, limit)
  }

  async markRelayed(ids: number[]): Promise<void> {
    for (const row of this.rows) {
      if (ids.includes(row.id)) row.relayedAt = new Date()
    }
  }

  async enqueue(
    jobs: Array<{ name: string; payload: unknown; idempotencyKey: string }>,
  ): Promise<void> {
    for (const job of jobs) {
      if (this.enqueued.some((j) => j.idempotencyKey === job.idempotencyKey)) continue
      this.enqueued.push({ name: job.name, idempotencyKey: job.idempotencyKey })
    }
  }
}

const handlers = (map: Record<string, string[]>) => (event: string) => map[event] ?? []

describe('emit', () => {
  it('writes one outbox row per event', async () => {
    const store = new FakeOutbox()

    await emit(
      store,
      { name: 'post.created', payload: { postId: 1, threadId: 1, forumId: 1, authorId: 7 } },
      { name: 'thread.created', payload: { threadId: 1, forumId: 1, authorId: 7 } },
    )

    expect(store.rows).toHaveLength(2)
    expect(store.rows.map((r) => r.name)).toEqual(['post.created', 'thread.created'])
  })

  it('is a no-op for an empty event list', async () => {
    const store = new FakeOutbox()
    await emit(store)
    expect(store.rows).toHaveLength(0)
  })

  it('drops a duplicate dedupeKey', async () => {
    const store = new FakeOutbox()
    const event = {
      name: 'user.registered' as const,
      payload: { userId: 1, email: 'a@b.test', requiresActivation: true },
      dedupeKey: 'register:1',
    }

    await emit(store, event)
    await emit(store, event)

    expect(store.rows).toHaveLength(1)
  })
})

describe('relayOutbox', () => {
  it('enqueues one job per registered handler', async () => {
    const store = new FakeOutbox()
    await emit(store, {
      name: 'post.created',
      payload: { postId: 1, threadId: 1, forumId: 1, authorId: 7 },
    })

    const result = await relayOutbox({
      reader: store,
      target: store,
      handlerIdsFor: handlers({ 'post.created': ['search.index', 'notify.subscribers'] }),
    })

    expect(result).toEqual({ claimed: 1, enqueued: 2 })
    expect(store.enqueued.map((j) => j.idempotencyKey)).toEqual([
      'outbox:1:search.index',
      'outbox:1:notify.subscribers',
    ])
  })

  it('produces no duplicate jobs when run twice', async () => {
    const store = new FakeOutbox()
    await emit(store, {
      name: 'post.created',
      payload: { postId: 1, threadId: 1, forumId: 1, authorId: 7 },
    })

    const handlerMap = handlers({ 'post.created': ['search.index'] })

    await relayOutbox({ reader: store, target: store, handlerIdsFor: handlerMap })
    const second = await relayOutbox({ reader: store, target: store, handlerIdsFor: handlerMap })

    expect(second).toEqual({ claimed: 0, enqueued: 0 })
    expect(store.enqueued).toHaveLength(1)
  })

  it('re-enqueues identical keys after a crash before markRelayed', async () => {
    const store = new FakeOutbox()
    await emit(store, {
      name: 'post.created',
      payload: { postId: 1, threadId: 1, forumId: 1, authorId: 7 },
    })

    const crashingReader: OutboxReader = {
      claimUnrelayed: (limit) => store.claimUnrelayed(limit),
      markRelayed: async () => {
        throw new Error('process died before marking relayed')
      },
    }
    const handlerMap = handlers({ 'post.created': ['search.index'] })

    await expect(
      relayOutbox({ reader: crashingReader, target: store, handlerIdsFor: handlerMap }),
    ).rejects.toThrow('process died')

    expect(store.enqueued).toHaveLength(1)

    const recovered = await relayOutbox({
      reader: store,
      target: store,
      handlerIdsFor: handlerMap,
    })

    expect(recovered.claimed).toBe(1)
    expect(store.enqueued).toHaveLength(1)
  })

  it('marks events with no handlers relayed so they are not re-read forever', async () => {
    const store = new FakeOutbox()
    await emit(store, { name: 'settings.changed', payload: { keys: ['board.name'] } })

    const first = await relayOutbox({
      reader: store,
      target: store,
      handlerIdsFor: handlers({}),
    })
    const second = await relayOutbox({
      reader: store,
      target: store,
      handlerIdsFor: handlers({}),
    })

    expect(first).toEqual({ claimed: 1, enqueued: 0 })
    expect(second).toEqual({ claimed: 0, enqueued: 0 })
  })

  it('respects the batch size', async () => {
    const store = new FakeOutbox()
    for (let i = 0; i < 5; i++) {
      await emit(store, { name: 'forum.structure_changed', payload: { forumIds: [i] } })
    }

    const result = await relayOutbox({
      reader: store,
      target: store,
      handlerIdsFor: handlers({ 'forum.structure_changed': ['cache.bust'] }),
      batchSize: 2,
    })

    expect(result.claimed).toBe(2)
    expect(store.rows.filter((r) => r.relayedAt === null)).toHaveLength(3)
  })
})
