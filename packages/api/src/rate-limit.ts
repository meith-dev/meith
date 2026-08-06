export interface RateLimitWindow {
  readonly seconds: number
  readonly budget: number
}

export const DEFAULT_WINDOW: RateLimitWindow = { seconds: 300, budget: 600 }

export interface RateLimitStore {
  consume(tokenId: number, windowStart: Date, cost: number): Promise<number>
}

export interface RateLimitOutcome {
  readonly allowed: boolean
  readonly used: number
  readonly budget: number
  readonly resetSeconds: number
}

export function windowStart(now: Date, window: RateLimitWindow): Date {
  const seconds = Math.floor(now.getTime() / 1000)
  return new Date((seconds - (seconds % window.seconds)) * 1000)
}

export async function consumeRateLimit(
  store: RateLimitStore,
  tokenId: number,
  cost: number,
  now: Date,
  window: RateLimitWindow = DEFAULT_WINDOW,
): Promise<RateLimitOutcome> {
  const start = windowStart(now, window)
  const used = await store.consume(tokenId, start, cost)
  const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000)

  return {
    allowed: used <= window.budget,
    used,
    budget: window.budget,
    resetSeconds: Math.max(1, window.seconds - elapsed),
  }
}

export function rateLimitHeaders(outcome: RateLimitOutcome): Record<string, string> {
  return {
    'x-ratelimit-limit': String(outcome.budget),
    'x-ratelimit-remaining': String(Math.max(0, outcome.budget - outcome.used)),
    'x-ratelimit-reset': String(outcome.resetSeconds),
  }
}
