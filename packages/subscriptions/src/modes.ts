/**
 * F56 — how often, not how.
 *
 * A subscription's mode is a **cadence**. The column it replaced held a
 * channel ('none' | 'email' | 'notification'), and F55 answered that question
 * board-wide and better: everything is recorded on-site, and
 * `notification_preferences` decides per kind whether an e-mail follows. Two
 * answers to one question is two things to keep in step, and they would come
 * apart the first time anybody changed one.
 *
 * So what is left for a subscription to say is when the member wants to hear:
 * as it happens, once a day, once a week — or, having deliberately followed
 * something, never.
 */

/** The four cadences, in the order the management screen offers them. */
export const SUBSCRIPTION_MODES = ['instant', 'daily', 'weekly', 'none'] as const

export type SubscriptionMode = (typeof SUBSCRIPTION_MODES)[number]

/** The two the digest task runs. `instant` has its own, faster task. */
export const DIGEST_CADENCES = ['daily', 'weekly'] as const

export type DigestCadence = (typeof DIGEST_CADENCES)[number]

/** How long a cadence waits between digests. */
export const CADENCE_INTERVAL_MS: Readonly<Record<DigestCadence, number>> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

/** What each mode is called on screen. */
export const MODE_LABELS: Readonly<Record<SubscriptionMode, string>> = {
  instant: 'As it happens',
  daily: 'Daily digest',
  weekly: 'Weekly digest',
  none: 'Do not notify me',
}

/**
 * Narrow a stored or submitted value without trusting it.
 *
 * Returns `null` rather than a default, so a caller has to decide what an
 * unrecognised value means. The management form treats it as "no change" and
 * the notifier treats it as "not my cadence" — two different right answers,
 * which is exactly why this does not pick one.
 */
export function parseSubscriptionMode(value: string): SubscriptionMode | null {
  return SUBSCRIPTION_MODES.includes(value as SubscriptionMode)
    ? (value as SubscriptionMode)
    : null
}

export function isDigestCadence(value: string): value is DigestCadence {
  return DIGEST_CADENCES.includes(value as DigestCadence)
}

/** What a subscription points at. Threads and communities are separate tables. */
export type SubscriptionTarget = 'thread' | 'community'

export function parseSubscriptionTarget(value: string): SubscriptionTarget | null {
  return value === 'thread' || value === 'community' ? value : null
}
