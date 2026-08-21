import {
  type RateLimitBucketStore,
  type RateLimitOutcome,
  type RateLimitWindow,
  spendRateLimit,
} from '@meith/core'

export type { RateLimitOutcome, RateLimitWindow } from '@meith/core'

export const DEFAULT_WINDOW: RateLimitWindow = { seconds: 300, budget: 600 }

export const ANONYMOUS_WINDOW: RateLimitWindow = { seconds: 300, budget: 120 }

export type RateLimitStore = RateLimitBucketStore<number>

export type AnonymousRateLimitStore = RateLimitBucketStore<string>

export async function consumeRateLimit(
  store: RateLimitStore,
  tokenId: number,
  cost: number,
  now: Date,
  window: RateLimitWindow = DEFAULT_WINDOW,
): Promise<RateLimitOutcome> {
  return spendRateLimit(store, tokenId, cost, window, now)
}

export function rateLimitHeaders(outcome: RateLimitOutcome): Record<string, string> {
  return {
    'x-ratelimit-limit': String(outcome.budget),
    'x-ratelimit-remaining': String(Math.max(0, outcome.budget - outcome.used)),
    'x-ratelimit-reset': String(outcome.resetSeconds),
  }
}

export async function consumeAnonymousRateLimit(
  store: AnonymousRateLimitStore,
  subject: string,
  cost: number,
  now: Date,
  window: RateLimitWindow = ANONYMOUS_WINDOW,
): Promise<RateLimitOutcome> {
  return spendRateLimit(store, subject, cost, window, now)
}
