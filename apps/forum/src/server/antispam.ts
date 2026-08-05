import 'server-only'

/**
 * F46 at the app layer — one place that knows how to spend a limit and how to
 * build a challenge.
 *
 * ## Every entry point fails open
 *
 * A limiter that cannot reach the database refuses **nothing**. That is the
 * opposite of the usual security default and it is the right one here: this is
 * a nuisance control, not an authorisation boundary, and a database blip that
 * closed it would stop every member on the board from posting in order to stop
 * a spammer who is not currently trying. Authorisation is `can()`, it is
 * elsewhere, and it fails closed.
 *
 * ## Guests are counted by the address F09 already truncates
 *
 * Not by a fresh read of the header, and not by a full address. The prefix is
 * what the audit log stores and what the ban filter matches on, so an operator
 * looking at a limit and at a ban is looking at the same identifier.
 */
import {
  QuestionCaptcha,
  RateLimiter,
  checkHoneypot,
  noCaptcha,
  holdsForReview,
  subjectFor,
  type CaptchaProvider,
  type Challenge,
  type ChallengeVerdict,
  type ConfiguredRateLimitScope,
  type RateLimitOutcome,
} from '@meith/antispam'
import type { Actor } from '@meith/authorization'
import { env, logger, truncateIp } from '@meith/core'
import {
  PostgresCaptchaQuestionRepository,
  PostgresRateLimitBucketStore,
  getDb,
} from '@meith/db'
import type { SettingsSnapshot } from '@meith/settings'

import { remoteAddress } from './admin'
import { getContainer } from './container'
import { getSettings } from './settings'

/** Which setting holds each scope's hourly allowance. */
const LIMIT_SETTING = {
  post: 'antispam.post_per_hour',
  search: 'antispam.search_per_hour',
  message: 'antispam.message_per_hour',
  report: 'antispam.report_per_hour',
  upload: 'antispam.upload_per_hour',
} as const satisfies Record<ConfiguredRateLimitScope, string>

const HOUR = 3600

/**
 * How many verification links one address may be sent per hour.
 *
 * Fixed rather than a setting, for the reason `FIXED_RATE_LIMIT_SCOPES` gives:
 * the thing being protected is somebody's mailbox, not the board's quiet.
 * Three is enough for a member who typed the wrong address, deleted the first
 * mail, and then found it in spam.
 */
const RESEND_PER_HOUR = 3

export function rateLimitStore(): PostgresRateLimitBucketStore | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresRateLimitBucketStore(getDb())
    : null
}

export function captchaQuestionRepository(): PostgresCaptchaQuestionRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresCaptchaQuestionRepository(getDb())
    : null
}

/**
 * Spend one action against a scope's hourly allowance.
 *
 * Returns `null` when nothing was spent — no store, no limit configured, or the
 * actor is exempt — so a caller can tell "allowed" from "not even measured"
 * without a second question.
 *
 * **`flood.bypass` exempts.** The same global action that exempts a group from
 * the posting interval, because an operator who has decided a group is not
 * flooding should not have to say it twice in two vocabularies.
 */
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
    /* See this file's header: a nuisance control does not take the board down. */
    logger().warn({ err: String(error), scope: input.scope }, 'rate limit unavailable')
    return null
  }
}

/**
 * Spend one verification resend against an address's hourly allowance (F18).
 *
 * Counted by **address**, because the address is what is being protected: a
 * script hammering the resend form is trying to fill one mailbox, and an
 * attacker who rotates addresses instead gets nothing — a resend for an unknown
 * or already-active account sends no mail at all.
 *
 * The spend happens before the account is looked up, and that ordering is the
 * enumeration defence: the refusal a caller can provoke by asking four times is
 * identical whether or not anybody has that address.
 *
 * Returns null when nothing was counted (no store), which fails open exactly as
 * `spendLimit` does and for the reason in this file's header.
 */
export async function spendResendLimit(emailLower: string): Promise<RateLimitOutcome | null> {
  const store = rateLimitStore()
  if (store === null) return null

  try {
    return await new RateLimiter(store).consume({
      scope: 'verify_resend',
      /* Prefixed so it can never collide with `subjectFor`'s `u:`/`ip:` keys. */
      subject: `e:${emailLower}`,
      rule: { max: RESEND_PER_HOUR, windowSeconds: HOUR },
    })
  } catch (error) {
    logger().warn({ err: String(error) }, 'resend rate limit unavailable')
    return null
  }
}

/** The sentence a refused caller is shown. One wording, five call sites. */
export function limitMessage(outcome: RateLimitOutcome & { allowed: false }): string {
  const minutes = Math.ceil(outcome.retryAfterSeconds / 60)
  return minutes <= 1
    ? 'You have done that too many times. Try again in a minute.'
    : `You have done that too many times. Try again in ${minutes} minutes.`
}

/**
 * The board's captcha, resolved from the setting.
 *
 * `noCaptcha` rather than `null` when it is off, so a call site cannot forget
 * to branch — "off" and "on" take the same path, and the form that forgot the
 * check is not a form that silently has no captcha.
 */
export async function boardCaptcha(settings?: SettingsSnapshot): Promise<CaptchaProvider> {
  const resolved = settings ?? (await getSettings())
  if (resolved.get('antispam.captcha_mode') !== 'question') return noCaptcha

  const repository = captchaQuestionRepository()
  if (repository === null) return noCaptcha

  return new QuestionCaptcha({ list: () => repository.active() })
}

export interface IssuedChallenge {
  /** `null` when nothing needs showing. */
  readonly challenge: Challenge | null
  /** Whether the form should carry the hidden trap field. */
  readonly honeypot: boolean
  /** Milliseconds since the epoch, echoed back so the fill time can be checked. */
  readonly issuedAt: number
}

/** Everything a form needs to render its share of F46. */
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

/**
 * Check a submitted form's challenge fields.
 *
 * The honeypot is checked **before** the captcha, and the ordering is not
 * cosmetic: a bot that filled the invisible field is refused without a database
 * read, which is the cheap half of the feature doing the work under load.
 */
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
    /* Fails open, like the limiter, and for the same reason. */
    logger().warn({ err: String(error) }, 'could not verify a challenge')
    return { ok: true }
  }
}

/**
 * Whether this author's next post is held for review (F46).
 *
 * The post count is **passed in** rather than fetched here, because both
 * posting paths already load the author's profile to get their username — and a
 * second read of the same row on the hottest write on the board would be a
 * query added by an anti-spam feature that is switched off on most boards.
 *
 * `moderation.bypass` is resolved through `can()` like every other permission
 * question (R4), never from group ids.
 */
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
    /* Fails open, like everything else here: a blip must not hold every post. */
    logger().warn({ err: String(error) }, 'could not resolve first-post moderation')
    return false
  }
}

/** Whether this deployment can enforce any of it at all. */
export function antispamAvailable(): boolean {
  return env.DATA_SOURCE === 'postgres'
}
