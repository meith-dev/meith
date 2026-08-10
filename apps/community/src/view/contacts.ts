import { isOnline, type RelationKind, type RelationRow } from '@meith/relations'
import type { TimeModel } from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { formatTime } from './time'

export interface ContactRowView {
  readonly userId: number
  readonly username: string
  readonly profileHref: string
  readonly isOnline: boolean
  readonly lastSeenLabel: string | null
  readonly addedAt: TimeModel
  readonly messageHref: string | null
}

export interface ContactsView {
  readonly kind: RelationKind
  readonly buddies: readonly ContactRowView[]
  readonly ignored: readonly ContactRowView[]
  readonly onlineCount: number
  readonly total: number
  readonly limit: number
}

export function buildContactsView(input: {
  readonly kind: RelationKind
  readonly buddies: readonly RelationRow[]
  readonly ignored: readonly RelationRow[]
  readonly limit: number
  readonly now: Date
  readonly timeZone?: string
}): ContactsView {
  const row = (entry: RelationRow): ContactRowView => ({
    userId: entry.userId,
    username: entry.username,
    profileHref: memberHref(entry.userId),
    isOnline: isOnline(entry.lastActiveAt, input.now),
    lastSeenLabel:
      entry.lastActiveAt === null
        ? null
        : `Last seen ${formatTime(entry.lastActiveAt, input.now, input.timeZone).label}`,
    addedAt: formatTime(entry.createdAt, input.now, input.timeZone),
    messageHref:
      entry.kind === 'buddy'
        ? `/messages/compose?to=${encodeURIComponent(entry.username)}`
        : null,
  })

  const buddies = input.buddies.map(row)

  return {
    kind: input.kind,
    buddies,
    ignored: input.ignored.map(row),
    onlineCount: buddies.filter((entry) => entry.isOnline).length,
    total: input.buddies.length + input.ignored.length,
    limit: input.limit,
  }
}

export function contactsNotice(query: {
  readonly added?: string | undefined
  readonly ignored?: string | undefined
  readonly removed?: string | undefined
}): { kind: 'info'; message: string } | null {
  if (query.added !== undefined) {
    return { kind: 'info', message: `${nameOf(query.added)} is now on your buddy list.` }
  }
  if (query.ignored !== undefined) {
    return {
      kind: 'info',
      message:
        `You are now ignoring ${nameOf(query.ignored)}. Their posts are hidden ` +
        'behind a link, and they cannot send you private messages.',
    }
  }
  if (query.removed !== undefined) {
    return { kind: 'info', message: `${nameOf(query.removed)} has been taken off your lists.` }
  }
  return null
}

function nameOf(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return 'That member'
  return trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed
}
