/** F61's pure buddy/ignore view models. */
import { isOnline, type RelationKind, type RelationRow } from '@forum/relations'
import type { TimeModel } from '@forum/theme-kit'

import { memberHref } from './member-profile'
import { formatTime } from './time'

export interface ContactRowView {
  readonly userId: number
  readonly username: string
  readonly profileHref: string
  readonly isOnline: boolean
  /** "Last seen 3 hours ago", or null when they have never been seen. */
  readonly lastSeenLabel: string | null
  readonly addedAt: TimeModel
  /** Where a message to them is composed. Null on the ignore list. */
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
    /*
     * Null rather than "never": `last_active_at` had no writer before F61, so
     * on an existing board every member reads as never-seen until their next
     * visit. Printing "Last seen never" beside somebody who posted this morning
     * would be a worse lie than saying nothing.
     */
    lastSeenLabel:
      entry.lastActiveAt === null
        ? null
        : `Last seen ${formatTime(entry.lastActiveAt, input.now, input.timeZone).label}`,
    addedAt: formatTime(entry.createdAt, input.now, input.timeZone),
    /*
     * Not offered on the ignore list. A "send a message" button beside somebody
     * you have chosen not to read is an invitation to a conversation you have
     * already declined — and F61's block means they cannot answer.
     */
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
    /*
     * Buddies only. "How many of the people I ignore are online" is not a
     * question anybody asks, and answering it would put the ignore list back on
     * the screen as something to watch.
     */
    onlineCount: buddies.filter((entry) => entry.isOnline).length,
    total: input.buddies.length + input.ignored.length,
    limit: input.limit,
  }
}

/** The notice after an action, assembled from the query string. */
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

/**
 * A username out of the query string, as text.
 *
 * Rendered as text by every caller, so this only has to stop it being
 * unreasonably long — the query string is anybody's to write, and a notice is
 * not a place to print two kilobytes of somebody's choosing.
 */
function nameOf(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return 'That member'
  return trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed
}
