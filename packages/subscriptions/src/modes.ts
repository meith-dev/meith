export const SUBSCRIPTION_MODES = ['instant', 'daily', 'weekly', 'none'] as const

export type SubscriptionMode = (typeof SUBSCRIPTION_MODES)[number]

export const DIGEST_CADENCES = ['daily', 'weekly'] as const

export type DigestCadence = (typeof DIGEST_CADENCES)[number]

export const CADENCE_INTERVAL_MS: Readonly<Record<DigestCadence, number>> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

export const MODE_LABELS: Readonly<Record<SubscriptionMode, string>> = {
  instant: 'As it happens',
  daily: 'Daily digest',
  weekly: 'Weekly digest',
  none: 'Do not notify me',
}

export function parseSubscriptionMode(value: string): SubscriptionMode | null {
  return SUBSCRIPTION_MODES.includes(value as SubscriptionMode)
    ? (value as SubscriptionMode)
    : null
}

export function isDigestCadence(value: string): value is DigestCadence {
  return DIGEST_CADENCES.includes(value as DigestCadence)
}

export type SubscriptionTarget = 'thread' | 'forum'

export function parseSubscriptionTarget(value: string): SubscriptionTarget | null {
  return value === 'thread' || value === 'forum' ? value : null
}
