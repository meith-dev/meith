import { beforeEach, describe, expect, it } from 'vitest'

import { groupByThread, SubscriptionNotifier } from './notifier'
import type { PendingForUser, PendingPost, SubscriptionRepository } from './types'

const NOW = new Date('2026-07-31T12:00:00Z')

function post(over: Partial<PendingPost> = {}): PendingPost {
  return {
    postId: 100,
    threadId: 10,
    threadTitle: 'A thread',
    threadSlug: 'a-thread',
    forumId: 1,
    authorUsername: 'ivan',
    createdAt: NOW,
    ...over,
  }
}

interface Raised {
  userId: number
  kind: string
  data: Record<string, unknown>
  href: string | null
  dedupeKey: string | null
}

class MemorySubscriptions implements SubscriptionRepository {
  due: number[] = []
  pending = new Map<number, PendingPost[]>()
  readonly advanced: Array<{ userId: number; watermarks: PendingForUser['watermarks'] }> = []
  readonly digestRuns: Array<{ userId: number; cadence: string }> = []
  failFor: number | null = null

  async subscribe() {
    return true
  }
  async unsubscribe() {
    return true
  }
  async modeFor() {
    return null
  }
  async listFor() {
    return []
  }

  async usersWithPending(input: { limit: number }) {
    return this.due.slice(0, input.limit)
  }

  async pendingFor(input: { userId: number }): Promise<PendingForUser> {
    if (this.failFor === input.userId) throw new Error('read failed')

    const posts = this.pending.get(input.userId) ?? []
    const highest = new Map<number, number>()
    for (const p of posts) {
      highest.set(p.threadId, Math.max(highest.get(p.threadId) ?? 0, p.postId))
    }
    return {
      userId: input.userId,
      posts,
      watermarks: [...highest].map(([targetId, lastPostId]) => ({
        target: 'thread' as const,
        targetId,
        lastPostId,
      })),
    }
  }

  async advanceWatermarks(input: { userId: number; watermarks: PendingForUser['watermarks'] }) {
    this.advanced.push({ userId: input.userId, watermarks: input.watermarks })
  }

  async recordDigestRun(input: { userId: number; cadence: string }) {
    this.digestRuns.push({ userId: input.userId, cadence: input.cadence })
  }
}

let subscriptions: MemorySubscriptions
let raised: Raised[]
let visible: number[]

function notifier(secret: string | null = null): SubscriptionNotifier {
  return new SubscriptionNotifier({
    subscriptions,
    notifications: {
      async raise(input) {
        raised.push(input as Raised)
      },
    },
    forums: { visibleForumIdsFor: async () => visible },
    unsubscribeSecret: secret,
    now: () => NOW,
  })
}

beforeEach(() => {
  subscriptions = new MemorySubscriptions()
  raised = []
  visible = [1]
})

describe('grouping', () => {
  it('collapses a thread’s posts into one entry with a count', () => {
    const threads = groupByThread([
      post({ postId: 100 }),
      post({ postId: 101, authorUsername: 'mod' }),
    ])

    expect(threads).toHaveLength(1)
    expect(threads[0]?.posts).toBe(2)
    expect(threads[0]?.lastAuthor).toBe('mod')
  })

  it('deep-links to the first post the member has not seen', () => {
    const threads = groupByThread([post({ postId: 100, threadId: 10 })])
    expect(threads[0]?.href).toBe('/thread/10-a-thread?after=99')
  })

  it('puts the busiest thread first', () => {
    const threads = groupByThread([
      post({ postId: 1, threadId: 10 }),
      post({ postId: 2, threadId: 11, threadTitle: 'Busier' }),
      post({ postId: 3, threadId: 11, threadTitle: 'Busier' }),
    ])
    expect(threads.map((t) => t.threadId)).toEqual([11, 10])
  })

  it('survives an account that has been deleted', () => {
    const threads = groupByThread([post({ authorUsername: null })])
    expect(threads[0]?.lastAuthor).toBeNull()
  })
})

describe('instant', () => {
  beforeEach(() => {
    subscriptions.due = [7]
  })

  it('raises one notification per thread, not per post', async () => {
    subscriptions.pending.set(7, [
      post({ postId: 100, threadId: 10 }),
      post({ postId: 101, threadId: 10 }),
      post({ postId: 102, threadId: 11, threadTitle: 'Another' }),
    ])

    const { notified } = await notifier().runInstant()

    expect(notified).toBe(1)
    expect(raised).toHaveLength(2)
    expect(raised.map((r) => r.dedupeKey)).toEqual([
      'subscription.reply:10',
      'subscription.reply:11',
    ])
  })

  it('carries a signed unsubscribe token when the board has a secret', async () => {
    subscriptions.pending.set(7, [post()])

    await notifier('board-secret').runInstant()

    expect(typeof raised[0]?.data.unsubscribe).toBe('string')
  })

  it('carries none when the board has no secret', async () => {
    subscriptions.pending.set(7, [post()])

    await notifier().runInstant()

    expect(raised[0]?.data.unsubscribe).toBeNull()
  })

  it('advances the watermark after telling somebody', async () => {
    subscriptions.pending.set(7, [post({ postId: 100 }), post({ postId: 104 })])

    await notifier().runInstant()

    expect(subscriptions.advanced).toEqual([
      { userId: 7, watermarks: [{ target: 'thread', targetId: 10, lastPostId: 104 }] },
    ])
  })

  it('advances the watermark even when everything was filtered out', async () => {
    subscriptions.pending.set(7, [])

    await notifier().runInstant()

    expect(raised).toEqual([])
    expect(subscriptions.advanced).toEqual([])
  })

  it('tells nobody when there is nothing pending', async () => {
    const outcome = await notifier().runInstant()
    expect(outcome).toEqual({ notified: 0, considered: 1 })
  })

  it('keeps going when one member’s read fails', async () => {
    subscriptions.due = [7, 8]
    subscriptions.failFor = 7
    subscriptions.pending.set(8, [post()])

    const { notified, considered } = await notifier().runInstant()

    expect(considered).toBe(2)
    expect(notified).toBe(1)
    expect(raised[0]?.userId).toBe(8)
  })

  it('never advances a watermark for a member it failed to read', async () => {
    subscriptions.due = [7]
    subscriptions.failFor = 7

    await notifier().runInstant()

    expect(subscriptions.advanced).toEqual([])
  })
})

describe('digests', () => {
  beforeEach(() => {
    subscriptions.due = [7]
    subscriptions.pending.set(7, [
      post({ postId: 100, threadId: 10 }),
      post({ postId: 101, threadId: 10 }),
      post({ postId: 102, threadId: 11, threadTitle: 'Another' }),
    ])
  })

  it('raises exactly one notification listing every thread', async () => {
    const { notified } = await notifier().runDigest('daily')

    expect(notified).toBe(1)
    expect(raised).toHaveLength(1)
    expect(raised[0]?.kind).toBe('subscription.digest')
    expect(raised[0]?.data.threadCount).toBe(2)
    expect(raised[0]?.data.postCount).toBe(3)
  })

  it('never coalesces: two periods are two digests', async () => {
    await notifier().runDigest('weekly')
    expect(raised[0]?.dedupeKey).toBeNull()
  })

  it('stamps the member’s clock for that cadence only', async () => {
    await notifier().runDigest('weekly')
    expect(subscriptions.digestRuns).toEqual([{ userId: 7, cadence: 'weekly' }])
  })

  it('does not stamp the clock when there was nothing to send', async () => {
    subscriptions.pending.set(7, [])

    await notifier().runDigest('daily')

    expect(subscriptions.digestRuns).toEqual([])
  })

  it('carries the board-wide unsubscribe scope, not a per-thread one', async () => {
    await notifier('board-secret').runDigest('daily')
    const token = raised[0]?.data.unsubscribe
    expect(typeof token).toBe('string')
    expect(String(token)).toContain('.email.0.')
  })

  it('bounds the thread list and counts the rest', async () => {
    subscriptions.pending.set(
      7,
      Array.from({ length: 15 }, (_, i) =>
        post({ postId: 200 + i, threadId: 20 + i, threadTitle: `Thread ${i}` }),
      ),
    )

    await notifier().runDigest('daily')

    expect((raised[0]!.data.threads as unknown[]).length).toBe(10)
    expect(raised[0]?.data.more).toBe(5)
    expect(raised[0]?.data.threadCount).toBe(15)
  })
})
