import type { Translator } from '@meith/i18n'
import type { FolderCounts, MessageDetail, MessageFolder, MessageListRow } from '@meith/messages'
import type { LinkModel, TimeModel } from '@meith/theme-kit'

import { formatTime } from './time'

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
  readonly peopleLabel: string
  readonly at: TimeModel
  readonly isUnread: boolean
}

export interface QuotaView {
  readonly stored: number
  readonly quota: number
  readonly label: string
  readonly isFull: boolean
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
  readonly t?: Translator
}): MessageFolderView {
  const tabs: readonly FolderTab[] = (['inbox', 'sent', 'trash'] as const).map((folder) => ({
    folder,
    label: FOLDER_LABELS[folder],
    href: folderHref(folder),
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
      at: formatTime(row.sentAt, input.now, input.t),
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

function peopleLabel(row: MessageListRow): string {
  const names = [...row.counterparties]
  if (names.length === 0)
    return row.moreCounterparties > 0 ? `${row.moreCounterparties} people` : '—'

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
  readonly readLabel: string | null
}

export interface MessageView {
  readonly id: number
  readonly subject: string
  readonly author: string
  readonly at: TimeModel
  readonly bodyHtml: string
  readonly folder: MessageFolder
  readonly participants: readonly ParticipantView[]
  readonly tracking: readonly ParticipantView[]
  readonly actions: readonly LinkModel[]
  readonly reportHref: string | null
}

export function buildMessageView(input: {
  readonly detail: MessageDetail
  readonly bodyHtml: string
  readonly viewerUserId: number
  readonly now: Date
  readonly t?: Translator
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
          : `Read ${formatTime(participant.readAt, input.now, input.t).label}`,
  }))

  return {
    id: detail.message.id,
    subject: detail.message.subject === '' ? '(no subject)' : detail.message.subject,
    author:
      detail.message.authorUsername === '' ? 'A deleted member' : detail.message.authorUsername,
    at: formatTime(detail.message.sentAt, input.now, input.t),
    bodyHtml: input.bodyHtml,
    folder: detail.copy.folder,
    participants,
    tracking: isAuthor ? participants.filter((p) => p.role !== 'author') : [],
    actions: [
      ...(isAuthor
        ? []
        : [{ label: 'Reply', href: `/messages/compose?reply=${detail.message.id}` }]),
      { label: 'Forward', href: `/messages/compose?forward=${detail.message.id}` },
    ],
    reportHref: isAuthor ? null : `/report?kind=private_message&id=${detail.message.id}`,
  }
}

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
