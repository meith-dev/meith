import { AUTOMATIC_TIMEZONE, type MemberSettings } from '@meith/accounts'
import { maxLengthFor, type ResolvedProfileField } from '@meith/profile-fields'

export interface TimezoneChoice {
  readonly value: string
  readonly label: string
}

export const AUTOMATIC_TIMEZONE_LABEL = 'Automatic — whatever this device is set to'

export function timezoneChoices(): readonly TimezoneChoice[] {
  return [
    { value: AUTOMATIC_TIMEZONE, label: AUTOMATIC_TIMEZONE_LABEL },
    ...availableTimezones().map((zone) => ({
      value: zone,
      label: zone.replace(/_/g, ' '),
    })),
  ]
}

export function availableTimezones(): readonly string[] {
  const supported = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[]
    }
  ).supportedValuesOf

  if (typeof supported === 'function') {
    try {
      return supported('timeZone')
    } catch {
      /* ignore */
    }
  }

  return FALLBACK_TIMEZONES
}

const FALLBACK_TIMEZONES: readonly string[] = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export function profileFormValues(settings: MemberSettings): {
  location: string
  website: string
  bio: string
} {
  return {
    location: settings.location ?? '',
    website: settings.website ?? '',
    bio: settings.bio ?? '',
  }
}

export function optionsFormValues(settings: MemberSettings): {
  timezone: string
  postsPerPage: string
  threadsPerPage: string
  invisible: boolean
} {
  return {
    timezone: settings.timezone,
    postsPerPage: settings.postsPerPage === null ? '' : String(settings.postsPerPage),
    threadsPerPage: settings.threadsPerPage === null ? '' : String(settings.threadsPerPage),
    invisible: settings.invisible,
  }
}

export function customFieldInputs(
  resolved: readonly ResolvedProfileField[],
): readonly {
  key: string
  label: string
  description: string | null
  type: string | null
  options: readonly string[]
  value: string
  maxLength: number
  required: boolean
}[] {
  return resolved.map((entry) => ({
    key: entry.field.key,
    label: entry.field.label,
    description: entry.field.description,
    type: entry.field.type,
    options: entry.field.options,
    value: entry.value,
    maxLength: maxLengthFor(entry.field),
    required: false,
  }))
}

export function userCpNotice(query: {
  readonly saved?: string | undefined
  readonly changed?: string | undefined
  readonly sent?: string | undefined
  readonly confirmed?: string | undefined
  readonly failed?: string | undefined
}): { kind: 'info' | 'warning'; message: string } | null {
  if (query.saved === 'processing') {
    return {
      kind: 'info',
      message:
        'Your new avatar is being processed and will appear shortly.',
    }
  }
  if (query.saved === 'removed') {
    return { kind: 'info', message: 'Your avatar has been removed.' }
  }
  if (query.saved !== undefined) return { kind: 'info', message: 'Saved.' }
  if (query.changed === 'password') {
    return {
      kind: 'info',
      message:
        'Your password has been changed. You are still signed in here; every other device has been signed out.',
    }
  }
  if (query.sent !== undefined) {
    return {
      kind: 'info',
      message:
        'Check the new address for a confirmation link. Nothing changes until you follow it.',
    }
  }
  if (query.confirmed !== undefined) {
    return { kind: 'info', message: 'Your e-mail address has been changed.' }
  }
  if (query.failed !== undefined) {
    return {
      kind: 'warning',
      message:
        'That confirmation link is no longer valid — it may have been used already, expired, or the address may have been taken in the meantime.',
    }
  }
  return null
}
