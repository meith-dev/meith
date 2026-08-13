import { AUTOMATIC_TIMEZONE, isKnownTimezone } from '@meith/accounts'

import { DEFAULT_TIMEZONE } from './time'

export const TIMEZONE_COOKIE = 'meith_tz'

export interface ResolvedTimezone {
  readonly zone: string
  readonly isAutomatic: boolean
}

export function detectedTimezone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const zone = value.trim()
  if (zone === '' || zone === AUTOMATIC_TIMEZONE) return null

  return isKnownTimezone(zone) ? zone : null
}

export function resolveTimezone(input: {
  readonly stored?: string | null | undefined
  readonly detected?: string | null | undefined
}): ResolvedTimezone {
  const stored = input.stored ?? null

  if (stored !== null && stored !== AUTOMATIC_TIMEZONE && isKnownTimezone(stored)) {
    return { zone: stored, isAutomatic: false }
  }

  return {
    zone: detectedTimezone(input.detected) ?? DEFAULT_TIMEZONE,
    isAutomatic: true,
  }
}
