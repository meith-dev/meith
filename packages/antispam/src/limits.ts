/**
 * F46 — rate limits that hold across instances.
 *
 * ## Why this exists when a flood interval already did
 *
 * F39's posting flood is a *minimum gap between two actions*, read from
 * `users.last_post_at`. It is genuinely multi-instance — the answer is a column
 * — and it is the wrong shape for spam. A script that posts every 31 seconds
 * satisfies a 30-second interval forever, and by morning the board has 2,800
 * posts on it, each one individually within the rules.
 *
 * A limit is the other question: **how many in a window.** The two compose
 * rather than replace each other, and both are kept — the interval stops a
 * double-submit, the limit stops a night's work.
 *
 * ## The counter is the write
 *
 * `consume` is one statement: insert-or-increment, `returning` the new total.
 * That matters more here than anywhere else in the codebase, because the whole
 * point of the feature is concurrency. A read-then-write would let ten requests
 * arriving together each see nine and each decide it was fine — which is not a
 * rare interleaving under an attack, it is the *expected* one, since flooding
 * is exactly the traffic that arrives in parallel.
 *
 * It is therefore impossible to check a limit without spending against it, and
 * that asymmetry is deliberate: a caller that wanted to "just look" would be a
 * caller that later forgets to spend.
 *
 * ## Fixed windows, not a sliding log
 *
 * A sliding window needs a row per action and a scan to answer a question; a
 * fixed window needs one row per subject per window and answers by primary key.
 * The cost is the boundary — somebody can spend a full allowance at 10:59 and
 * another at 11:00 — and for spam control that is an acceptable failure, since
 * the attacker's reward is one extra window rather than an unbounded one.
 * Storing a row per post attempt to close it would mean the anti-spam feature
 * became the board's largest table.
 */

/** What is being limited. One of the five F46 names, and no free text. */
export const RATE_LIMIT_SCOPES = ['post', 'search', 'message', 'report', 'upload'] as const
export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[number]

export function isRateLimitScope(value: string): value is RateLimitScope {
  return (RATE_LIMIT_SCOPES as readonly string[]).includes(value)
}

/**
 * Storage seam. `@meith/antispam` is a domain package (R2), so no `@meith/db`.
 *
 * The contract is the important half: **`consume` must be atomic** — increment
 * and return the new total in one statement, never read-then-write. Every
 * guarantee in this module rests on that, and an implementation that got it
 * wrong would pass every single-threaded test.
 */
export interface RateLimitStore {
  consume(input: {
    readonly scope: RateLimitScope
    /** Who or what is being counted. Opaque here; built by `subjectFor`. */
    readonly subject: string
    readonly windowStart: Date
    readonly cost: number
  }): Promise<number>

  /** Windows nobody will read again. Bounded, and driven by F06's tick. */
  prune(before: Date, limit?: number): Promise<number>
}

export interface RateLimitRule {
  /** Actions allowed per window. `0` disables the limit entirely. */
  readonly max: number
  readonly windowSeconds: number
}

export type RateLimitOutcome =
  | { readonly allowed: true; readonly used: number; readonly remaining: number }
  | {
      readonly allowed: false
      readonly used: number
      /** Seconds until the window rolls over, so the caller can say when. */
      readonly retryAfterSeconds: number
    }

/**
 * The subject a limit counts against.
 *
 * A member is counted by id. A guest has no id, so they are counted by the
 * **truncated** address F09 already stores — the same value the audit log
 * keeps, and for the same reason: it is enough to group by and not enough to
 * identify somebody by.
 *
 * A guest with no address at all is counted under a single shared bucket. That
 * is deliberately harsh — everybody unidentifiable shares one allowance — and
 * it is the safe direction: the alternative is a bucket per unknown, which is
 * no limit at all and is trivially reached by omitting a header.
 */
export function subjectFor(actor: {
  readonly userId: number | null
  readonly ipPrefix?: string | null
}): string {
  if (actor.userId !== null) return `u:${actor.userId}`
  const prefix = actor.ipPrefix ?? ''
  return prefix === '' ? 'anon' : `ip:${prefix}`
}

/**
 * The window a moment falls in.
 *
 * Floored to a multiple of the window length **from the epoch**, not from the
 * first request, so every instance computes the same boundary from the clock
 * alone. Deriving it from anything stored would make two instances disagree
 * about which row to increment, which is the same bug as having no limit.
 */
export function windowStartFor(now: Date, windowSeconds: number): Date {
  const size = windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / size) * size)
}

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Spend one action against a rule, and say whether it was allowed.
   *
   * **The spend happens either way.** A refused attempt still counts, which is
   * the difference between a limit and a speed bump: without it, an attacker
   * who ignores the refusal and keeps posting gets a fresh decision every time
   * and the window never fills.
   *
   * `max: 0` short-circuits before touching the store — an operator who has not
   * configured a limit should not be paying for a write on every post.
   */
  async consume(input: {
    readonly scope: RateLimitScope
    readonly subject: string
    readonly rule: RateLimitRule
    readonly cost?: number
  }): Promise<RateLimitOutcome> {
    const { max, windowSeconds } = input.rule
    if (max <= 0 || windowSeconds <= 0) {
      return { allowed: true, used: 0, remaining: Number.POSITIVE_INFINITY }
    }

    const now = this.now()
    const windowStart = windowStartFor(now, windowSeconds)
    const used = await this.store.consume({
      scope: input.scope,
      subject: input.subject,
      windowStart,
      cost: input.cost ?? 1,
    })

    if (used <= max) {
      return { allowed: true, used, remaining: max - used }
    }

    const resetAt = windowStart.getTime() + windowSeconds * 1000
    return {
      allowed: false,
      used,
      /* At least a second: "try again in 0 seconds" reads as a bug. */
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
    }
  }
}
