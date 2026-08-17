import {
  AUTOMATIC_LOCALE,
  AUTOMATIC_TIMEZONE,
  type MemberGroupChoice,
  type MemberSettings,
} from '@meith/accounts'
import { SOURCE_LOCALE, type Translator } from '@meith/i18n'
import { maxLengthFor, type ResolvedProfileField } from '@meith/profile-fields'

import { untranslated } from './time'

export interface TimezoneChoice {
  readonly value: string
  readonly label: string
}

export const AUTOMATIC_TIMEZONE_KEY = 'usercp.automaticTimezone'

export function timezoneChoices(t: Translator = untranslated()): readonly TimezoneChoice[] {
  return [
    { value: AUTOMATIC_TIMEZONE, label: t.t(AUTOMATIC_TIMEZONE_KEY) },
    ...availableTimezones().map((zone) => ({
      value: zone,
      label: zone.replace(/_/g, ' '),
    })),
  ]
}

export const AUTOMATIC_LOCALE_KEY = 'usercp.automaticLocale'

export function localeChoices(
  supported: readonly string[],
  t: Translator = untranslated(),
): readonly TimezoneChoice[] {
  return [
    { value: AUTOMATIC_LOCALE, label: t.t(AUTOMATIC_LOCALE_KEY) },
    ...[...supported]
      .map((locale) => ({ value: locale, label: localeName(locale) }))
      .sort((a, b) => a.label.localeCompare(b.label, SOURCE_LOCALE)),
  ]
}

export function localeName(locale: string): string {
  try {
    const named = new Intl.DisplayNames([locale], { type: 'language' }).of(locale)
    return named === undefined || named === locale ? locale : `${named} (${locale})`
  } catch {
    return locale
  }
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

export interface DisplayGroupChoices {
  readonly choices: readonly { value: string; label: string }[]
  readonly selected: string
}

export function displayGroupChoices(
  held: readonly MemberGroupChoice[],
  displayGroupId: number | null,
): DisplayGroupChoices {
  if (held.find((group) => group.isPrimary)?.isStaff === true) {
    return { choices: [], selected: '' }
  }

  const choices = held.map((group) => ({
    value: String(group.groupId),
    label: group.isPrimary ? `${group.title} — your main group` : group.title,
  }))

  const primary = held.find((group) => group.isPrimary)
  const fallback = primary === undefined ? '' : String(primary.groupId)
  const chosen = displayGroupId === null ? null : String(displayGroupId)

  return {
    choices,
    selected:
      chosen !== null && choices.some((choice) => choice.value === chosen) ? chosen : fallback,
  }
}

export function optionsFormValues(settings: MemberSettings): {
  timezone: string
  locale: string
  postsPerPage: string
  threadsPerPage: string
  invisible: boolean
} {
  return {
    timezone: settings.timezone,
    locale: settings.locale,
    postsPerPage: settings.postsPerPage === null ? '' : String(settings.postsPerPage),
    threadsPerPage: settings.threadsPerPage === null ? '' : String(settings.threadsPerPage),
    invisible: settings.invisible,
  }
}

export function customFieldInputs(resolved: readonly ResolvedProfileField[]): readonly {
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

export function userCpNotice(
  query: {
    readonly saved?: string | undefined
    readonly changed?: string | undefined
    readonly sent?: string | undefined
    readonly confirmed?: string | undefined
    readonly failed?: string | undefined
  },
  t: Translator = untranslated(),
): { kind: 'info' | 'warning'; message: string } | null {
  if (query.saved === 'processing') {
    return { kind: 'info', message: t.t('usercp.avatarProcessing') }
  }
  if (query.saved === 'removed') {
    return { kind: 'info', message: t.t('usercp.avatarRemoved') }
  }
  if (query.saved !== undefined) return { kind: 'info', message: t.t('usercp.saved') }
  if (query.changed === 'password') {
    return { kind: 'info', message: t.t('usercp.passwordChanged') }
  }
  if (query.sent !== undefined) {
    return { kind: 'info', message: t.t('usercp.emailConfirmSent') }
  }
  if (query.confirmed !== undefined) {
    return { kind: 'info', message: t.t('usercp.emailChanged') }
  }
  if (query.failed !== undefined) {
    return { kind: 'warning', message: t.t('usercp.linkInvalid') }
  }
  return null
}
