import { type RateLimitBucketStore, spendRateLimit } from '@meith/core'

export const RATE_LIMIT_SCOPES = ['post', 'search', 'message', 'report', 'upload'] as const
export type ConfiguredRateLimitScope = (typeof RATE_LIMIT_SCOPES)[number]

export const FIXED_RATE_LIMIT_SCOPES = [
  'verify_resend',
  'api_anon',
  'passkey',
  'credential_proof',
] as const
export type FixedRateLimitScope = (typeof FIXED_RATE_LIMIT_SCOPES)[number]

export const AUTH_RATE_LIMIT_SCOPES = ['reset', 'reset_ip', 'register_ip'] as const
export type AuthRateLimitScope = (typeof AUTH_RATE_LIMIT_SCOPES)[number]

export const GROUP_RATE_LIMIT_SCOPES = ['post_day', 'message_day'] as const
export type GroupRateLimitScope = (typeof GROUP_RATE_LIMIT_SCOPES)[number]

export const DAY_SECONDS = 86_400

export type RateLimitScope =
  | ConfiguredRateLimitScope
  | FixedRateLimitScope
  | AuthRateLimitScope
  | GroupRateLimitScope

export function isRateLimitScope(value: string): value is ConfiguredRateLimitScope {
  return (RATE_LIMIT_SCOPES as readonly string[]).includes(value)
}

export interface RateLimitSubject {
  readonly scope: RateLimitScope
  readonly subject: string
}

export type RateLimitStore = RateLimitBucketStore<RateLimitSubject>

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

    const outcome = await spendRateLimit(
      this.store,
      { scope: input.scope, subject: input.subject },
      input.cost ?? 1,
      { seconds: windowSeconds, budget: max },
      this.now(),
    )

    if (outcome.allowed) {
      return { allowed: true, used: outcome.used, remaining: max - outcome.used }
    }

    return { allowed: false, used: outcome.used, retryAfterSeconds: outcome.resetSeconds }
  }
}
