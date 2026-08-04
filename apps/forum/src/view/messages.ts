/** F60's pure private-message view models. */
import type { FolderCounts, MessageDetail, MessageFolder, MessageListRow } from '@meith/messages'
import type { LinkModel, TimeModel } from '@meith/theme-kit'

import { formatTime } from './time'

/**
 * The id the folder checkboxes point at.
 *
 * F52's trick, and one constant for the same reason: the value has to match
 * between the `form` attribute on every checkbox and the `id` on the action
 * bar, and a mismatch is silent — the boxes stop being submitted and the member
 * sees "Select at least one message" while looking at six ticks.
 */
export const MESSAGE_FORM_ID = 'message-actions'

export interface FolderTab {
  readonly folder: MessageFolder
  readonly label: string
  readonly href: string
  readonly count: number
  readonly isCurrent: boolean
}

export interface MessageRowView {
  readonly copyId: number
  readonly href: string
  readonly subject: string
  readonly people: string
  /** "From" in the inbox and trash, "To" in the sent folder. */
  readonly peopleLabel: string
  readonly at: TimeModel
  readonly isUnread: boolean
}

export interface QuotaView {
  readonly stored: number
  readonly quota: number
  readonly label: string
  /** True at or over the limit: the compose link is refused, so say why first. */
  readonly isFull: boolean
  /** True near it, so a member finds out before a send fails. */
  readonly isNearlyFull: boolean
}

export interface MessageFolderView {
  readonly folder: MessageFolder
  readonly tabs: readonly FolderTab[]
  readonly rows: readonly MessageRowView[]
  readonly nextHref: string | null
  readonly quota: QuotaView
  readonly composeHref: string
}

const FOLDER_LABELS: Readonly<Record<MessageFolder, string>> = {
  inbox: 'Inbox',
  sent: 'Sent',
  trash: 'Trash',
}

export function folderHref(folder: MessageFolder): string {
  return folder === 'inbox' ? '/messages' : `/messages?folder=${folder}`
}

/**
 * How full a member's message store is.
 *
 * `quota` 0 means unlimited, matching every numeric permission on this board
 * (R4.2) — which is why the label branches rather than dividing by it.
 */
export function quotaView(counts: FolderCounts, quota: number): QuotaView {
  if (quota <= 0) {
    return {
      stored: counts.stored,
      quota: 0,
      label: `${counts.stored} stored`,
      isFull: false,
      isNearlyFull: false,
    }
  }

  return {
    stored: counts.stored,
    quota,
    label: `${counts.stored} of ${quota} stored`,
    isFull: counts.stored >= quota,
    /*
     * Nine tenths. Warning at the limit is warning too late — the member is
     * already unable to send, and the first they hear of it is a refusal.
     */
    isNearlyFull: counts.stored >= Math.floor(quota * 0.9),
  }
}

export function buildMessageFolderView(input: {
  readonly folder: MessageFolder
  readonly rows: readonly MessageListRow[]
  readonly counts: FolderCounts
  readonly quota: number
  readonly nextBefore: number | null
  readonly now: Date
  readonly timeZone?: string
}): MessageFolderView {
  const tabs: readonly FolderTab[] = (['inbox', 'sent', 'trash'] as const).map((folder) => ({
    folder,
    label: FOLDER_LABELS[folder],
    href: folderHref(folder),
    /*
     * The inbox tab counts *unread*, the others count everything. A number on
     * the inbox that never goes down is a number nobody reads; on Sent and
     * Trash "how many are in here" is the only question.
     */
    count: folder === 'inbox' ? input.counts.unread : input.counts[folder],
    isCurrent: folder === input.folder,
  }))

  return {
    folder: input.folder,
    tabs,
    rows: input.rows.map((row) => ({
      copyId: row.copyId,
      href: `/messages/${row.messageId}`,
      subject: row.subject === '' ? '(no subject)' : row.subject,
      people: peopleLabel(row),
      peopleLabel: row.folder === 'sent' ? 'To' : 'From',
      at: formatTime(row.sentAt, input.now, input.timeZone),
      /*
       * Only a received copy can be unread. The sender's own copy is marked
       * read on send in the repository, and showing "new" beside something the
       * member wrote themselves would be nonsense.
       */
      isUnread: row.readAt === null && row.role !== 'author',
    })),
    nextHref:
      input.nextBefore === null
        ? null
        : `${folderHref(input.folder)}${input.folder === 'inbox' ? '?' : '&'}before=${input.nextBefore}`,
    quota: quotaView(input.counts, input.quota),
    composeHref: '/messages/compose',
  }
}

/**
 * "Alice", "Alice and Bob", "Alice, Bob and 4 others".
 *
 * A line has room for about three names. The remainder is a count rather than a
 * truncated fourth name, because a half-rendered username reads like a typo.
 */
function peopleLabel(row: MessageListRow): string {
  const names = [...row.counterparties]
  if (names.length === 0) return row.moreCounterparties > 0 ? `${row.moreCounterparties} people` : '—'

  if (row.moreCounterparties > 0) {
    return `${names.join(', ')} and ${row.moreCounterparties} ${
      row.moreCounterparties === 1 ? 'other' : 'others'
    }`
  }

  if (names.length === 1) return names[0] as string
  const last = names.pop() as string
  return `${names.join(', ')} and ${last}`
}

export interface ParticipantView {
  readonly username: string
  readonly role: 'author' | 'to' | 'bcc'
  /** "Read 2 hours ago", "Not read yet", or null when it is the author's copy. */
  readonly readLabel: string | null
}

export interface MessageView {
  readonly id: number
  readonly subject: string
  readonly author: string
  readonly at: TimeModel
  /** Trusted HTML from `@meith/bbcode`, exactly as a post body is (F36). */
  readonly bodyHtml: string
  readonly folder: MessageFolder
  readonly participants: readonly ParticipantView[]
  /** The sender's tracking list, empty for a recipient. */
  readonly tracking: readonly ParticipantView[]
  readonly actions: readonly LinkModel[]
  readonly reportHref: string | null
}

export function buildMessageView(input: {
  readonly detail: MessageDetail
  readonly bodyHtml: string
  readonly viewerUserId: number
  readonly now: Date
  readonly timeZone?: string
}): MessageView {
  const { detail } = input
  const isAuthor = detail.copy.role === 'author'

  const participants: readonly ParticipantView[] = detail.participants.map((participant) => ({
    username: participant.username,
    role: participant.role,
    readLabel:
      participant.role === 'author'
        ? null
        : participant.readAt === null
          ? 'Not read yet'
          : `Read ${formatTime(participant.readAt, input.now, input.timeZone).label}`,
  }))

  return {
    id: detail.message.id,
    subject: detail.message.subject === '' ? '(no subject)' : detail.message.subject,
    author: detail.message.authorUsername === '' ? 'A deleted member' : detail.message.authorUsername,
    at: formatTime(detail.message.sentAt, input.now, input.timeZone),
    bodyHtml: input.bodyHtml,
    folder: detail.copy.folder,
    participants,
    /*
     * Tracking is the author's view of who has read it. Shown only to them:
     * a recipient learning when the *other* recipients opened it is a fact
     * they were never party to.
     */
    tracking: isAuthor ? participants.filter((p) => p.role !== 'author') : [],
    actions: [
      /*
       * No reply on your own sent copy: the author of a message is not
       * somebody it can be replied to, and "reply" that addresses yourself is
       * refused by the service anyway (F60 has no note-to-self).
       */
      ...(isAuthor
        ? []
        : [{ label: 'Reply', href: `/messages/compose?reply=${detail.message.id}` }]),
      { label: 'Forward', href: `/messages/compose?forward=${detail.message.id}` },
    ],
    /*
     * Reporting your own message is pointless rather than forbidden, so the
     * link is simply absent from the author's copy — F49 files the report
     * either way if somebody posts the form by hand, and a moderator closes it.
     */
    reportHref: isAuthor
      ? null
      : `/report?kind=private_message&id=${detail.message.id}`,
  }
}

/** The notice after an action, assembled from the query string. */
export function messageNotice(query: {
  readonly sent?: string | undefined
  readonly moved?: string | undefined
  readonly deleted?: string | undefined
  readonly marked?: string | undefined
  readonly emptied?: string | undefined
}): { kind: 'info'; message: string } | null {
  if (query.sent !== undefined) return { kind: 'info', message: 'Your message has been sent.' }
  if (query.moved !== undefined) {
    return { kind: 'info', message: `${plural(query.moved, 'message')} moved.` }
  }
  if (query.deleted !== undefined) {
    return { kind: 'info', message: `${plural(query.deleted, 'message')} deleted.` }
  }
  if (query.marked !== undefined) {
    return { kind: 'info', message: `${plural(query.marked, 'message')} updated.` }
  }
  if (query.emptied !== undefined) {
    return { kind: 'info', message: `Trash emptied: ${plural(query.emptied, 'message')} deleted.` }
  }
  return null
}

function plural(raw: string, noun: string): string {
  const n = Number(raw)
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}
