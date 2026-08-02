/** F57's pure UserCP view models. */
import type { MemberSettings } from '@forum/accounts'
import { maxLengthFor, type ResolvedProfileField } from '@forum/profile-fields'
import type { LinkModel } from '@forum/theme-kit'

/**
 * The zones the options screen offers.
 *
 * Read from the platform's own tz database rather than shipped as a list: a
 * hard-coded one is wrong the next time a country changes its rules, and the
 * runtime already carries the data `Intl` formats with. `supportedValuesOf` is
 * where that list lives; a runtime without it falls back to a short set that
 * covers most of the board's likely members rather than offering nothing.
 */
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
      /* Fall through to the short list. */
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

export interface UserCpSection {
  readonly title: string
  readonly description: string
  readonly link: LinkModel
}

/**
 * The panel's index.
 *
 * F55's and F56's screens are listed here rather than moved: both work on their
 * own URLs, both are linked from elsewhere, and a member who bookmarked one
 * should not find it gone. The UserCP is where they are *findable*, which is
 * what F57 owes them — not where they have to live.
 */
export function userCpSections(): readonly UserCpSection[] {
  return [
    {
      title: 'Profile',
      description: 'What other members see about you.',
      link: { label: 'Edit your profile', href: '/usercp/profile' },
    },
    {
      title: 'Options',
      description: 'Your timezone and how much of a thread fits on a page.',
      link: { label: 'Change your options', href: '/usercp/options' },
    },
    {
      title: 'E-mail and password',
      description: 'Both need your current password.',
      link: { label: 'Account security', href: '/usercp/security' },
    },
    {
      title: 'Subscriptions',
      description: 'The threads and forums you follow, and how often you hear about them.',
      link: { label: 'Manage subscriptions', href: '/subscriptions' },
    },
    {
      title: 'Private messages',
      description: 'Your inbox, and what you have sent.',
      link: { label: 'Open your messages', href: '/messages' },
    },
    {
      title: 'Avatar',
      description: 'The picture shown beside your posts.',
      link: { label: 'Change your avatar', href: '/usercp/avatar' },
    },
    {
      title: 'Signature',
      description: 'What appears under every post you make.',
      link: { label: 'Edit your signature', href: '/usercp/signature' },
    },
    {
      title: 'Buddies and ignored members',
      description: 'Who you follow, and whose posts you would rather not read.',
      link: { label: 'Manage your lists', href: '/usercp/contacts' },
    },
    {
      title: 'Notifications',
      description: 'Which of them also reach you by e-mail.',
      link: { label: 'Notification preferences', href: '/notifications/preferences' },
    },
  ]
}

/** The profile form's fields, as strings a form can hold. */
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

/**
 * The options form's fields.
 *
 * A null page size becomes an **empty string**, not the board's number: the
 * empty box is what "follow the board" looks like, and pre-filling it with the
 * current default would turn a member's next save into a permanent override
 * they never asked for.
 */
export function optionsFormValues(settings: MemberSettings): {
  timezone: string
  postsPerPage: string
  threadsPerPage: string
} {
  return {
    timezone: settings.timezone,
    postsPerPage: settings.postsPerPage === null ? '' : String(settings.postsPerPage),
    threadsPerPage: settings.threadsPerPage === null ? '' : String(settings.threadsPerPage),
  }
}

/**
 * F59's editable fields, as the profile form's inputs.
 *
 * `maxLengthFor` resolves the field's own limit or its type's default, so the
 * browser's `maxlength` and the server's validation agree — a form that lets
 * somebody type 3,000 characters and then refuses the save is a worse
 * experience than one that stops at the limit.
 */
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
    /*
     * Required *at registration* is not required forever: a board that asked
     * once should not stop a member saving an unrelated change years later
     * because it has since been emptied by an operator.
     */
    required: false,
  }))
}

/** The notice after a save, assembled from the query string. */
export function userCpNotice(query: {
  readonly saved?: string | undefined
  readonly changed?: string | undefined
  readonly sent?: string | undefined
  readonly confirmed?: string | undefined
  readonly failed?: string | undefined
}): { kind: 'info' | 'warning'; message: string } | null {
  if (query.saved === 'processing') {
    /* F58. An avatar is re-encoded in a queued job, so "Saved." would be a
       small lie — the old picture is still what everybody sees for a moment. */
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
