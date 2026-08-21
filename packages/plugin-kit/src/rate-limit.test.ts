import { describe, expect, it } from 'vitest'

import { createRouteRateLimiter } from './rate-limit'

const T0 = 1_700_000_040_000

describe('the route rate limiter', () => {
  it('spends the window, refuses with a countdown, and lets a decayed caller back in', async () => {
    const limiter = createRouteRateLimiter()

    expect((await limiter.consume('k', 2, 60, T0)).allowed).toBe(true)
    expect((await limiter.consume('k', 2, 60, T0 + 1_000)).allowed).toBe(true)

    const refused = await limiter.consume('k', 2, 60, T0 + 2_000)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBe(58)

    expect((await limiter.consume('k', 2, 60, T0 + 105_000)).allowed).toBe(true)
  })

  it('does not hand a maxed-out caller a fresh budget moments after the window rolls', async () => {
    const limiter = createRouteRateLimiter()

    await limiter.consume('k', 2, 60, T0)
    await limiter.consume('k', 2, 60, T0 + 1_000)

    const refused = await limiter.consume('k', 2, 60, T0 + 60_000)
    expect(refused.allowed).toBe(false)
  })

  it('counts each key on its own', async () => {
    const limiter = createRouteRateLimiter()
    expect((await limiter.consume('a', 1, 60, T0)).allowed).toBe(true)
    expect((await limiter.consume('a', 1, 60, T0)).allowed).toBe(false)
    expect((await limiter.consume('b', 1, 60, T0)).allowed).toBe(true)
  })

  it('never advises a zero-second retry', async () => {
    const limiter = createRouteRateLimiter()
    await limiter.consume('k', 1, 1, T0)
    const refused = await limiter.consume('k', 1, 1, T0 + 999)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBe(1)
  })
})
