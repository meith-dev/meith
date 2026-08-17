import 'server-only'

import {
  type AuthRateLimitScope,
  type CaptchaProvider,
  type Challenge,
  type ChallengeVerdict,
  type ConfiguredRateLimitScope,
  checkHoneypot,
  DAY_SECONDS,
  type GroupRateLimitScope,
  holdsForReview,
  noCaptcha,
  QuestionCaptcha,
  RateLimiter,
  type RateLimitOutcome,
  subjectFor,
} from '@meith/antispam'
import type { Actor, NumericGlobalPermission } from '@meith/authorization'
import { env, logger, truncateIp } from '@meith/core'
import { getDb, PostgresCaptchaQuestionRepository, PostgresRateLimitBucketStore } from '@meith/db'
import type { SettingsSnapshot } from '@meith/settings'

import { remoteAddress } from './admin'
import { getContainer } from './container'
import { getSettings } from './settings'

const LIMIT_SETTING = {
  post: 'antispam.post_per_hour',
  search: 'antispam.search_per_hour',
  message: 'antispam.message_per_hour',
  report: 'antispam.report_per_hour',
  upload: 'antispam.upload_per_hour',
} as const satisfies Record<ConfiguredRateLimitScope, string>

const HOUR = 3600

const RESEND_PER_HOUR = 3

export function rateLimitStore(): PostgresRateLimitBucketStore | null {
  return getContainer().dataSource === 'postgres' ? new PostgresRateLimitBucketStore(getDb()) : null
}

export function captchaQuestionRepository(): PostgresCaptchaQuestionRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresCaptchaQuestionRepository(getDb())
    : null
}

export async function spendLimit(input: {
  readonly scope: ConfiguredRateLimitScope
  readonly actor: Actor
  readonly settings?: SettingsSnapshot
  readonly cost?: number
}): Promise<RateLimitOutcome | null> {
  const store = rateLimitStore()
  if (store === null) return null

  try {
    const { authorizer } = getContainer()
    if (authorizer.can(input.actor, 'flood.bypass')) return null

    const settings = input.settings ?? (await getSettings())
    const max = Number(settings.get(LIMIT_SETTING[input.scope] as never) ?? 0)
    if (max <= 0) return null

    const subject = subjectFor({
      userId: input.actor.userId,
      ipPrefix: truncateIp(await remoteAddress()) ?? null,
    })

    return await new RateLimiter(store).consume({
      scope: input.scope,
      subject,
      rule: { max, windowSeconds: HOUR },
      ...(input.cost === undefined ? {} : { cost: input.cost }),
    })
  } catch (error) {
    logger().warn({ err: String(error), scope: input.scope }, 'rate limit unavailable')
    return null
  }
}

const DAILY_LIMIT_PERMISSION = {
  post_day: 'maxPostsPerDay',
  message_day: 'maxPrivateMessagesPerDay',
} as const satisfies Record<GroupRateLimitScope, NumericGlobalPermission>

const DAILY_LIMIT_NOUN = {
  post_day: 'posts',
  message_day: 'private messages',
} as const satisfies Record<GroupRateLimitScope, string>

export async function spendDailyLimit(input: {
  readonly scope: GroupRateLimitScope
  readonly actor: Actor
}): Promise<RateLimitOutcome | null> {
  const store = rateLimitStore()
  if (store === null || input.actor.userId === null) return null

  try {
    const { authorizer } = getContainer()
    const max = authorizer.globalLimit(input.actor, DAILY_LIMIT_PERMISSION[input.scope])
    if (max <= 0) return null

    return await new RateLimiter(store).consume({
      scope: input.scope,
      subject: subjectFor({ userId: input.actor.userId }),
      rule: { max, windowSeconds: DAY_SECONDS },
    })
  } catch (error) {
    logger().warn({ err: String(error), scope: input.scope }, 'daily limit unavailable')
    return null
  }
}

export function dailyLimitMessage(
  scope: GroupRateLimitScope,
  outcome: RateLimitOutcome & { allowed: false },
): string {
  const hours = Math.ceil(outcome.retryAfterSeconds / 3600)
  const noun = DAILY_LIMIT_NOUN[scope]
  return hours <= 1
    ? `You have used your allowance of ${noun} for today. It resets within the hour.`
    : `You have used your allowance of ${noun} for today. It resets in ${hours} hours.`
}

type AuthLimitSetting =
  | 'antispam.register_ip_per_hour'
  | 'antispam.reset_per_hour'
  | 'antispam.reset_ip_per_hour'

async function spendAuthLimit(input: {
  readonly scope: AuthRateLimitScope
  readonly setting: AuthLimitSetting
  readonly subject: string | null
}): Promise<RateLimitOutcome | null> {
  const store = rateLimitStore()
  if (store === null || input.subject === null) return null

  try {
    const settings = await getSettings()
    const max = Number(settings.get(input.setting) ?? 0)
    if (max <= 0) return null

    return await new RateLimiter(store).consume({
      scope: input.scope,
      subject: input.subject,
      rule: { max, windowSeconds: HOUR },
    })
  } catch (error) {
    logger().warn({ err: String(error), scope: input.scope }, 'rate limit unavailable')
    return null
  }
}

async function requestPrefix(): Promise<string | null> {
  return truncateIp(await remoteAddress()) ?? null
}

export async function spendResetLimits(
  emailLower: string,
): Promise<readonly (RateLimitOutcome | null)[]> {
  const prefix = await requestPrefix()

  return [
    await spendAuthLimit({
      scope: 'reset',
      setting: 'antispam.reset_per_hour',
      subject: emailLower === '' ? null : `e:${emailLower}`,
    }),
    await spendAuthLimit({
      scope: 'reset_ip',
      setting: 'antispam.reset_ip_per_hour',
      subject: prefix === null ? null : `ip:${prefix}`,
    }),
  ]
}

export async function spendRegisterLimit(): Promise<RateLimitOutcome | null> {
  const prefix = await requestPrefix()

  return spendAuthLimit({
    scope: 'register_ip',
    setting: 'antispam.register_ip_per_hour',
    subject: prefix === null ? null : `ip:${prefix}`,
  })
}

export function refused(
  outcome: RateLimitOutcome | null,
): outcome is RateLimitOutcome & { allowed: false } {
  return outcome !== null && !outcome.allowed
}

export async function loginAddressAttempts(): Promise<number> {
  try {
    const max = Number((await getSettings()).get('antispam.login_ip_attempts') ?? 0)
    return Number.isFinite(max) && max > 0 ? max : 0
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read the per-address login limit')
    return 0
  }
}

export async function spendResendLimit(emailLower: string): Promise<RateLimitOutcome | null> {
  const store = rateLimitStore()
  if (store === null) return null

  try {
    return await new RateLimiter(store).consume({
      scope: 'verify_resend',
      subject: `e:${emailLower}`,
      rule: { max: RESEND_PER_HOUR, windowSeconds: HOUR },
    })
  } catch (error) {
    logger().warn({ err: String(error) }, 'resend rate limit unavailable')
    return null
  }
}

export function limitMessage(outcome: RateLimitOutcome & { allowed: false }): string {
  const minutes = Math.ceil(outcome.retryAfterSeconds / 60)
  return minutes <= 1
    ? 'You have done that too many times. Try again in a minute.'
    : `You have done that too many times. Try again in ${minutes} minutes.`
}

export async function boardCaptcha(settings?: SettingsSnapshot): Promise<CaptchaProvider> {
  const resolved = settings ?? (await getSettings())
  if (resolved.get('antispam.captcha_mode') !== 'question') return noCaptcha

  const repository = captchaQuestionRepository()
  if (repository === null) return noCaptcha

  return new QuestionCaptcha({ list: () => repository.active() })
}

export interface IssuedChallenge {
  readonly challenge: Challenge | null
  readonly honeypot: boolean
  readonly issuedAt: number
}

export async function issueChallenge(): Promise<IssuedChallenge> {
  try {
    const settings = await getSettings()
    const captcha = await boardCaptcha(settings)

    return {
      challenge: await captcha.issue(),
      honeypot: settings.get('antispam.honeypot') === true,
      issuedAt: Date.now(),
    }
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not issue a challenge')
    return { challenge: null, honeypot: false, issuedAt: Date.now() }
  }
}

export async function verifyChallenge(form: FormData): Promise<ChallengeVerdict> {
  try {
    const settings = await getSettings()

    const honeypot = settings.get('antispam.honeypot') === true
    const stamp = Number(form.get('_issued') ?? '')

    const trap = checkHoneypot({
      honeypot: honeypot ? String(form.get('contact_url') ?? '') : '',
      issuedAt: Number.isFinite(stamp) && stamp > 0 ? stamp : null,
      now: new Date(),
      minimumSeconds: Number(settings.get('antispam.min_form_seconds') ?? 0),
    })
    if (!trap.ok) return trap

    const captcha = await boardCaptcha(settings)
    return await captcha.verify({
      token: String(form.get('_challenge') ?? ''),
      answer: String(form.get('challenge_answer') ?? ''),
    })
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not verify a challenge')
    return { ok: true }
  }
}

export async function holdsNewMember(input: {
  readonly actor: Actor
  readonly postCount: number
  readonly settings?: SettingsSnapshot
}): Promise<boolean> {
  try {
    const settings = input.settings ?? (await getSettings())
    const threshold = Number(settings.get('antispam.moderate_first_posts') ?? 0)
    if (threshold <= 0) return false

    const { authorizer } = getContainer()
    return holdsForReview(
      {
        userId: input.actor.userId,
        postCount: input.postCount,
        bypassesModeration: authorizer.can(input.actor, 'content.viewUnapproved'),
      },
      { threshold },
    )
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not resolve first-post moderation')
    return false
  }
}

export function antispamAvailable(): boolean {
  return env.DATA_SOURCE === 'postgres'
}
