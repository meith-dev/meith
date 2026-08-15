export const RATE_LIMIT_SCOPES = ['post', 'search', 'message', 'report', 'upload'] as const
export type ConfiguredRateLimitScope = (typeof RATE_LIMIT_SCOPES)[number]

export const FIXED_RATE_LIMIT_SCOPES = ['verify_resend'] as const
export type FixedRateLimitScope = (typeof FIXED_RATE_LIMIT_SCOPES)[number]

export const AUTH_RATE_LIMIT_SCOPES = ['reset', 'reset_ip', 'register_ip'] as const
export type AuthRateLimitScope = (typeof AUTH_RATE_LIMIT_SCOPES)[number]

export type RateLimitScope =
  | ConfiguredRateLimitScope
  | FixedRateLimitScope
  | AuthRateLimitScope

export function isRateLimitScope(value: string): value is ConfiguredRateLimitScope {
  return (RATE_LIMIT_SCOPES as readonly string[]).includes(value)
}

export interface RateLimitStore {
  consume(input: {
    readonly scope: RateLimitScope
    readonly subject: string
    readonly windowStart: Date
    readonly cost: number
  }): Promise<number>

  prune(before: Date, limit?: number): Promise<number>
}

export interface RateLimitRule {
  readonly max: number
  readonly windowSeconds: number
}

export type RateLimitOutcome =
  | { readonly allowed: true; readonly used: number; readonly remaining: number }
  | {
      readonly allowed: false
      readonly used: number
      readonly retryAfterSeconds: number
    }

export function subjectFor(actor: {
  readonly userId: number | null
  readonly ipPrefix?: string | null
}): string {
  if (actor.userId !== null) return `u:${actor.userId}`
  const prefix = actor.ipPrefix ?? ''
  return prefix === '' ? 'anon' : `ip:${prefix}`
}

export function windowStartFor(now: Date, windowSeconds: number): Date {
  const size = windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / size) * size)
}

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

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
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
    }
  }
}
