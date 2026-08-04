import { describe, expect, it } from 'vitest'

import {
  RateLimiter,
  subjectFor,
  windowStartFor,
  type RateLimitScope,
  type RateLimitStore,
} from './limits'

/** A store that counts, the way the Postgres one does in one statement. */
function countingStore(): RateLimitStore & { calls: number } {
  const counts = new Map<string, number>()
  const store = {
    calls: 0,
    async consume(input: {
      scope: RateLimitScope
      subject: string
      windowStart: Date
      cost: number
    }) {
      store.calls += 1
      const key = `${input.scope}|${input.subject}|${input.windowStart.toISOString()}`
      const next = (counts.get(key) ?? 0) + input.cost
      counts.set(key, next)
      return next
    },
    async prune() {
      return 0
    },
  }
  return store
}

const RULE = { max: 3, windowSeconds: 60 }
const AT = new Date('2026-08-04T12:00:30Z')

describe('windows', () => {
  /*
   * Floored from the epoch, so every instance computes the same boundary from
   * the clock alone. Derived from anything stored, two instances would
   * increment different rows and the limit would not exist.
   */
  it('floors to a multiple of the window from the epoch', () => {
    expect(windowStartFor(new Date('2026-08-04T12:00:30Z'), 60).toISOString()).toBe(
      '2026-08-04T12:00:00.000Z',
    )
    expect(windowStartFor(new Date('2026-08-04T12:59:59Z'), 3600).toISOString()).toBe(
      '2026-08-04T12:00:00.000Z',
    )
  })

  it('gives two moments in the same window the same start', () => {
    const a = windowStartFor(new Date('2026-08-04T12:00:01Z'), 3600)
    const b = windowStartFor(new Date('2026-08-04T12:59:00Z'), 3600)
    expect(a.getTime()).toBe(b.getTime())
  })
})

describe('subjects', () => {
  it('counts a member by id', () => {
    expect(subjectFor({ userId: 7 })).toBe('u:7')
  })

  it('counts a guest by the truncated address F09 already stores', () => {
    expect(subjectFor({ userId: null, ipPrefix: '198.51.100' })).toBe('ip:198.51.100')
  })

  /*
   * Deliberately harsh, and the safe direction: a bucket per unknown is no
   * limit at all, and is reached by omitting a header.
   */
  it('puts every unidentifiable guest in one shared bucket', () => {
    expect(subjectFor({ userId: null, ipPrefix: null })).toBe('anon')
    expect(subjectFor({ userId: null, ipPrefix: '' })).toBe('anon')
  })

  it('never lets a guest collide with a member', () => {
    expect(subjectFor({ userId: 7 })).not.toBe(subjectFor({ userId: null, ipPrefix: '7' }))
  })
})

describe('consuming', () => {
  it('allows up to the limit and reports what is left', async () => {
    const limiter = new RateLimiter(countingStore(), () => AT)

    expect(await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })).toEqual({
      allowed: true,
      used: 1,
      remaining: 2,
    })
    await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    expect(await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })).toEqual({
      allowed: true,
      used: 3,
      remaining: 0,
    })
  })

  it('refuses the one past the limit and says when to come back', async () => {
    const limiter = new RateLimiter(countingStore(), () => AT)
    for (let i = 0; i < 3; i += 1) {
      await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    }

    const outcome = await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    expect(outcome.allowed).toBe(false)
    /* 30s into a 60s window. */
    expect(outcome.allowed === false && outcome.retryAfterSeconds).toBe(30)
  })

  /*
   * The difference between a limit and a speed bump. An attacker who ignores
   * the refusal and keeps going must not get a fresh decision every time — if
   * a refused attempt did not count, the window would never fill.
   */
  it('spends against the window even when it refuses', async () => {
    const store = countingStore()
    const limiter = new RateLimiter(store, () => AT)

    for (let i = 0; i < 6; i += 1) {
      await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    }

    expect(store.calls).toBe(6)
    const outcome = await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    expect(outcome.used).toBe(7)
  })

  it('never reports a retry of zero seconds', async () => {
    /* One millisecond before the window rolls over. */
    const edge = new Date('2026-08-04T12:00:59.999Z')
    const limiter = new RateLimiter(countingStore(), () => edge)
    for (let i = 0; i < 4; i += 1) {
      await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    }

    const outcome = await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    expect(outcome.allowed === false && outcome.retryAfterSeconds).toBe(1)
  })

  it('keeps scopes and subjects apart', async () => {
    const limiter = new RateLimiter(countingStore(), () => AT)
    await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })

    expect(await limiter.consume({ scope: 'search', subject: 'u:1', rule: RULE })).toMatchObject({
      used: 1,
    })
    expect(await limiter.consume({ scope: 'post', subject: 'u:2', rule: RULE })).toMatchObject({
      used: 1,
    })
  })

  it('starts again in the next window', async () => {
    const store = countingStore()
    let now = AT
    const limiter = new RateLimiter(store, () => now)

    for (let i = 0; i < 4; i += 1) {
      await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })
    }

    now = new Date('2026-08-04T12:01:05Z')
    expect(await limiter.consume({ scope: 'post', subject: 'u:1', rule: RULE })).toMatchObject({
      allowed: true,
      used: 1,
    })
  })
})

describe('a limit that is not configured', () => {
  /*
   * An operator who has set no limit must not pay for a write on every post.
   * The mutant this kills drops the short-circuit and hits the store anyway.
   */
  it('costs no store call at all', async () => {
    const store = countingStore()
    const limiter = new RateLimiter(store, () => AT)

    const outcome = await limiter.consume({
      scope: 'post',
      subject: 'u:1',
      rule: { max: 0, windowSeconds: 3600 },
    })

    expect(outcome.allowed).toBe(true)
    expect(store.calls).toBe(0)
  })

  it('treats a zero-length window as unconfigured too', async () => {
    const store = countingStore()
    const limiter = new RateLimiter(store, () => AT)

    await limiter.consume({ scope: 'post', subject: 'u:1', rule: { max: 5, windowSeconds: 0 } })
    expect(store.calls).toBe(0)
  })
})
