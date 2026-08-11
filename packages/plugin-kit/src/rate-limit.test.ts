import { describe, expect, it } from 'vitest'

import { createRouteRateLimiter } from './rate-limit'

const T0 = 1_700_000_000_000

describe('the route rate limiter', () => {
  it('spends the window, refuses with a countdown, and resets on the next window', () => {
    const limiter = createRouteRateLimiter()

    expect(limiter.consume('k', 2, 60, T0).allowed).toBe(true)
    expect(limiter.consume('k', 2, 60, T0 + 1_000).allowed).toBe(true)

    const refused = limiter.consume('k', 2, 60, T0 + 2_000)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBe(58)

    expect(limiter.consume('k', 2, 60, T0 + 60_000).allowed).toBe(true)
  })

  it('counts each key on its own', () => {
    const limiter = createRouteRateLimiter()
    expect(limiter.consume('a', 1, 60, T0).allowed).toBe(true)
    expect(limiter.consume('a', 1, 60, T0).allowed).toBe(false)
    expect(limiter.consume('b', 1, 60, T0).allowed).toBe(true)
  })

  it('never advises a zero-second retry', () => {
    const limiter = createRouteRateLimiter()
    limiter.consume('k', 1, 1, T0)
    const refused = limiter.consume('k', 1, 1, T0 + 999)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBe(1)
  })
})
