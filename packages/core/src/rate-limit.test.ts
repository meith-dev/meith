import { describe, expect, it } from 'vitest'

import type { RateLimitBucketStore } from './rate-limit'
import { rateLimitWindowStart, spendRateLimit } from './rate-limit'

function memoryStore(): RateLimitBucketStore<string> {
  const buckets = new Map<string, number>()
  const bucketKey = (key: string, windowStart: Date) => `${key}|${windowStart.toISOString()}`

  return {
    async spend(key, windowStart, cost) {
      const id = bucketKey(key, windowStart)
      const next = (buckets.get(id) ?? 0) + cost
      buckets.set(id, next)
      return next
    },
    async peek(key, windowStart) {
      return buckets.get(bucketKey(key, windowStart)) ?? 0
    },
  }
}

const WINDOW = { seconds: 60, budget: 10 }

describe('rateLimitWindowStart', () => {
  it('floors to a multiple of the window from the epoch', () => {
    expect(rateLimitWindowStart(new Date('2026-08-04T12:00:30Z'), WINDOW).toISOString()).toBe(
      '2026-08-04T12:00:00.000Z',
    )
  })

  it('gives two moments in the same window the same start', () => {
    const a = rateLimitWindowStart(new Date('2026-08-04T12:00:01Z'), WINDOW)
    const b = rateLimitWindowStart(new Date('2026-08-04T12:00:59Z'), WINDOW)
    expect(a.getTime()).toBe(b.getTime())
  })
})

describe('spendRateLimit: cost accounting', () => {
  it('allows spends within budget and reports what is used', async () => {
    const store = memoryStore()
    const now = new Date('2026-08-04T12:00:10Z')

    expect(await spendRateLimit(store, 'k', 4, WINDOW, now)).toEqual({
      allowed: true,
      used: 4,
      budget: 10,
      resetSeconds: 50,
    })
    expect((await spendRateLimit(store, 'k', 4, WINDOW, now)).used).toBe(8)
  })

  it('spends against the window even when it refuses', async () => {
    const store = memoryStore()
    const now = new Date('2026-08-04T12:00:10Z')

    const outcome = await spendRateLimit(store, 'k', 11, WINDOW, now)
    expect(outcome.allowed).toBe(false)
    expect(outcome.used).toBe(11)
  })

  it('honours a cost above one across several calls', async () => {
    const store = memoryStore()
    const now = new Date('2026-08-04T12:00:10Z')

    await spendRateLimit(store, 'k', 3, WINDOW, now)
    await spendRateLimit(store, 'k', 3, WINDOW, now)
    const outcome = await spendRateLimit(store, 'k', 3, WINDOW, now)

    expect(outcome).toEqual({ allowed: true, used: 9, budget: 10, resetSeconds: 50 })
  })

  it('keeps distinct keys independent', async () => {
    const store = memoryStore()
    const now = new Date('2026-08-04T12:00:10Z')

    await spendRateLimit(store, 'a', 9, WINDOW, now)
    expect((await spendRateLimit(store, 'b', 1, WINDOW, now)).used).toBe(1)
  })

  it('never reports a retry of zero seconds', async () => {
    const store = memoryStore()
    const outcome = await spendRateLimit(
      store,
      'k',
      1,
      WINDOW,
      new Date('2026-08-04T12:00:59.999Z'),
    )
    expect(outcome.resetSeconds).toBe(1)
  })
})

describe('spendRateLimit: boundary burst', () => {
  it('does not allow a full second budget just after a window rolls over', async () => {
    const store = memoryStore()
    const boundary = rateLimitWindowStart(new Date('2026-08-04T12:01:00Z'), WINDOW)
    const justBefore = new Date(boundary.getTime() - 1)
    const justAfter = new Date(boundary.getTime() + 1)

    const before = await spendRateLimit(store, 'k', WINDOW.budget, WINDOW, justBefore)
    expect(before.allowed).toBe(true)

    const after = await spendRateLimit(store, 'k', WINDOW.budget, WINDOW, justAfter)
    expect(after.allowed).toBe(false)
  })

  it('lets the full budget back in once the previous window has fully decayed', async () => {
    const store = memoryStore()
    const boundary = rateLimitWindowStart(new Date('2026-08-04T12:01:00Z'), WINDOW)
    const justBefore = new Date(boundary.getTime() - 1)
    const wellAfter = new Date(boundary.getTime() + WINDOW.seconds * 1000)

    await spendRateLimit(store, 'k', WINDOW.budget, WINDOW, justBefore)
    const outcome = await spendRateLimit(store, 'k', WINDOW.budget, WINDOW, wellAfter)

    expect(outcome.allowed).toBe(true)
  })

  it('still allows a moderate request early in a new window with light prior use', async () => {
    const store = memoryStore()
    const boundary = rateLimitWindowStart(new Date('2026-08-04T12:01:00Z'), WINDOW)
    const justBefore = new Date(boundary.getTime() - 1)
    const justAfter = new Date(boundary.getTime() + 1)

    await spendRateLimit(store, 'k', 2, WINDOW, justBefore)
    const outcome = await spendRateLimit(store, 'k', 2, WINDOW, justAfter)

    expect(outcome.allowed).toBe(true)
  })
})

describe('spendRateLimit: concurrent spend', () => {
  it('accounts for every concurrent caller, none lost to a lost update', async () => {
    const store = memoryStore()
    const now = new Date('2026-08-04T12:00:10Z')

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => spendRateLimit(store, 'k', 1, WINDOW, now)),
    )

    const used = outcomes.map((outcome) => outcome.used).sort((a, b) => a - b)
    expect(used).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(10)
  })

  it('lets exactly the budget worth of concurrent attempts through', async () => {
    const store = memoryStore()
    const now = new Date('2026-08-04T12:00:10Z')

    const outcomes = await Promise.all(
      Array.from({ length: 25 }, () => spendRateLimit(store, 'k', 1, WINDOW, now)),
    )

    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(10)
  })
})
