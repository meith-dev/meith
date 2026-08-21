export interface RateLimitWindow {
  readonly seconds: number
  readonly budget: number
}

export interface RateLimitBucketStore<TKey = string> {
  spend(key: TKey, windowStart: Date, cost: number): Promise<number>
  peek(key: TKey, windowStart: Date): Promise<number>
}

export interface RateLimitOutcome {
  readonly allowed: boolean
  readonly used: number
  readonly budget: number
  readonly resetSeconds: number
}

export function rateLimitWindowStart(now: Date, window: RateLimitWindow): Date {
  const sizeMs = window.seconds * 1000
  return new Date(Math.floor(now.getTime() / sizeMs) * sizeMs)
}

export async function spendRateLimit<TKey>(
  store: RateLimitBucketStore<TKey>,
  key: TKey,
  cost: number,
  window: RateLimitWindow,
  now: Date,
): Promise<RateLimitOutcome> {
  const { seconds, budget } = window
  const sizeMs = seconds * 1000
  const currentStart = rateLimitWindowStart(now, window)
  const previousStart = new Date(currentStart.getTime() - sizeMs)
  const elapsedMs = now.getTime() - currentStart.getTime()
  const previousWeight = Math.max(0, 1 - elapsedMs / sizeMs)

  const [current, previous] = await Promise.all([
    store.spend(key, currentStart, cost),
    store.peek(key, previousStart),
  ])

  const used = Math.ceil(current + previous * previousWeight)
  const resetSeconds = Math.max(1, seconds - Math.floor(elapsedMs / 1000))

  return { allowed: used <= budget, used, budget, resetSeconds }
}
