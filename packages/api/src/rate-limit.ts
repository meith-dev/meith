/**
 * F81 — the rate limit, and why it is a cost rather than a count.
 *
 * A limit expressed in *requests* prices a `/me` lookup the same as a full-text
 * search. The cheapest way for a token to be expensive is therefore to hit the
 * expensive endpoint, which is the one thing a limit exists to prevent. So each
 * route declares a `cost` and the window meters work.
 *
 * ## Postgres, and one statement
 *
 * No Redis (invariant: the serverless profile has none), no in-memory counter
 * (there are N instances and the counter would be per-instance, which is a limit
 * that multiplies by however many the platform decided to run). A row per token
 * per window, incremented with an upsert.
 *
 * **The check is the write.** `insert … on conflict do update … where` is one
 * statement, so the read and the increment cannot interleave — and API traffic
 * is exactly the traffic that arrives twenty requests at once, which is when a
 * check-then-write races and every one of them is under the limit.
 *
 * ## Fixed window, and the boundary is admitted
 *
 * A fixed window lets a caller spend the whole budget at the end of one window
 * and again at the start of the next — two budgets in two seconds. A sliding
 * window costs a second table and an ordering; a token bucket costs a stored
 * float and a clock read per request.
 *
 * For an API whose purpose is to stop a runaway script rather than to shape
 * traffic precisely, the fixed window is the right trade, and the burst it
 * permits is bounded by twice the budget. It is written down here rather than
 * discovered by whoever next reads the numbers.
 */

export interface RateLimitWindow {
  readonly seconds: number
  readonly budget: number
}

/** The default: 600 units per five minutes — 600 cheap calls, or 60 searches. */
export const DEFAULT_WINDOW: RateLimitWindow = { seconds: 300, budget: 600 }

export interface RateLimitStore {
  /**
   * Add `cost` to this token's current window and report the total after.
   *
   * One statement in the implementation. Returning the total *after* the
   * increment rather than before is what makes the caller's comparison correct
   * for the request it is about to serve.
   */
  consume(tokenId: number, windowStart: Date, cost: number): Promise<number>
}

export interface RateLimitOutcome {
  readonly allowed: boolean
  readonly used: number
  readonly budget: number
  /** Seconds until the window rolls. Sent as `retry-after` on a refusal. */
  readonly resetSeconds: number
}

/** The start of the window `now` falls in. Aligned, so every instance agrees. */
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

/**
 * The headers every response carries, refused or not.
 *
 * On success too, deliberately: a client that only learns its remaining budget
 * when it runs out cannot slow down before it does, and the standard shape of an
 * API integration is a loop that discovers the limit by hitting it.
 */
export function rateLimitHeaders(outcome: RateLimitOutcome): Record<string, string> {
  return {
    'x-ratelimit-limit': String(outcome.budget),
    'x-ratelimit-remaining': String(Math.max(0, outcome.budget - outcome.used)),
    'x-ratelimit-reset': String(outcome.resetSeconds),
  }
}
