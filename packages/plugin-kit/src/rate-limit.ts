export interface RateLimitVerdict {
  readonly allowed: boolean
  readonly retryAfterSeconds: number
}

export interface RouteRateLimiter {
  consume(key: string, limit: number, windowSeconds: number, nowMs: number): RateLimitVerdict
}

const SWEEP_EVERY = 512

/**
 * A fixed-window counter in process memory. Per instance and gone on restart,
 * deliberately: this is abuse pressure relief on a route, not an accounting
 * system, and a limiter that needed the database would put a query in front
 * of the very traffic it exists to shed.
 */
export function createRouteRateLimiter(): RouteRateLimiter {
  const windows = new Map<string, { start: number; count: number }>()
  let calls = 0

  return {
    consume(key, limit, windowSeconds, nowMs) {
      calls += 1
      const windowMs = windowSeconds * 1000

      if (calls % SWEEP_EVERY === 0) {
        for (const [stale, entry] of windows) {
          if (nowMs - entry.start >= windowMs) windows.delete(stale)
        }
      }

      const entry = windows.get(key)
      if (entry === undefined || nowMs - entry.start >= windowMs) {
        windows.set(key, { start: nowMs, count: 1 })
        return { allowed: true, retryAfterSeconds: 0 }
      }

      entry.count += 1
      if (entry.count <= limit) return { allowed: true, retryAfterSeconds: 0 }

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.start + windowMs - nowMs) / 1000)),
      }
    },
  }
}
