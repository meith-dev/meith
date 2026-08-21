import { type RateLimitBucketStore, spendRateLimit } from '@meith/core'

export interface RateLimitVerdict {
  readonly allowed: boolean
  readonly retryAfterSeconds: number
}

export interface RouteRateLimiter {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
    nowMs: number,
  ): Promise<RateLimitVerdict>
}

const SWEEP_EVERY = 512
const RETENTION_MS = 6 * 3600 * 1000

function memoryRateLimitBucketStore(): RateLimitBucketStore<string> {
  const buckets = new Map<string, { start: number; used: number }>()
  let calls = 0

  const bucketKey = (key: string, windowStart: Date) => `${key}|${windowStart.getTime()}`

  return {
    async spend(key, windowStart, cost) {
      calls += 1
      if (calls % SWEEP_EVERY === 0) {
        const cutoff = windowStart.getTime() - RETENTION_MS
        for (const [id, bucket] of buckets) {
          if (bucket.start < cutoff) buckets.delete(id)
        }
      }

      const id = bucketKey(key, windowStart)
      const next = (buckets.get(id)?.used ?? 0) + cost
      buckets.set(id, { start: windowStart.getTime(), used: next })
      return next
    },

    async peek(key, windowStart) {
      return buckets.get(bucketKey(key, windowStart))?.used ?? 0
    },
  }
}

export function createRouteRateLimiter(): RouteRateLimiter {
  const store = memoryRateLimitBucketStore()

  return {
    async consume(key, limit, windowSeconds, nowMs) {
      const outcome = await spendRateLimit(
        store,
        key,
        1,
        { seconds: windowSeconds, budget: limit },
        new Date(nowMs),
      )

      return outcome.allowed
        ? { allowed: true, retryAfterSeconds: 0 }
        : { allowed: false, retryAfterSeconds: outcome.resetSeconds }
    },
  }
}
