import type { Translator } from '@meith/i18n'
import type { MessageListRow } from '@meith/messages'
import type { QueueItem, ReportRow } from '@meith/moderation'
import type { NotificationView } from '@meith/notifications'
import type { TimeModel } from '@meith/theme-kit'

import { copyFor } from './copy'
import { formatTime, untranslated } from './time'

export const NOTIFICATION_MENU_PREVIEW = 10

export type NotificationMenuTabKind = 'notifications' | 'messages' | 'mod'

export interface NotificationMenuRow {
  readonly key: string
  readonly seenId: number | null
  readonly subject: string
  readonly meta: string | null
  readonly href: string | null
  readonly at: TimeModel
  readonly isUnread: boolean
  readonly tag: string | null
}

export interface ModerationSummary {
  readonly queue: readonly QueueItem[]
  readonly reports: readonly ReportRow[]
  readonly pending: number
  readonly openReports: number
}

export interface NotificationMenuTab {
  readonly kind: NotificationMenuTabKind
  readonly label: string
  readonly unread: number
  readonly rows: readonly NotificationMenuRow[]
  readonly allHref: string
  readonly emptyLabel: string
}

export interface NotificationMenuModel {
  readonly total: number
  readonly tabs: readonly NotificationMenuTab[]
}

function notificationRow(row: NotificationView, now: Date, t: Translator): NotificationMenuRow {
  return {
    key: `notification-${row.id}`,
    seenId: row.id,
    subject: row.subject,
    meta: row.body === '' ? null : firstLine(row.body),
    href: row.href,
    at: formatTime(row.updatedAt, now, t),
    isUnread: !row.isRead,
    tag: null,
  }
}

function messageRow(row: MessageListRow, now: Date, t: Translator): NotificationMenuRow {
  const from = row.counterparties[0] ?? null
  const more = row.moreCounterparties
  return {
    key: `message-${row.copyId}`,
    seenId: row.copyId,
    subject: row.subject === '' ? t.t('board.notificationMenu.noSubject') : row.subject,
    meta:
      from === null
        ? null
        : more > 0
          ? t.t('board.notificationMenu.fromMany', { name: from, count: more })
          : t.t('board.notificationMenu.from', { name: from }),
    href: `/messages/${row.messageId}`,
    at: formatTime(row.sentAt, now, t),
    isUnread: row.readAt === null && row.role !== 'author',
    tag: null,
  }
}

function queueRow(item: QueueItem, now: Date, t: Translator): NotificationMenuRow {
  return {
    key: `queue-${item.kind}-${item.id}`,
    seenId: null,
    subject: item.threadTitle,
    meta: item.forumTitle,
    href: '/moderation',
    at: formatTime(item.createdAt, now, t),
    isUnread: false,
    tag: t.t('board.notificationMenu.mod.pending'),
  }
}

function reportRow(report: ReportRow, now: Date, t: Translator): NotificationMenuRow {
  return {
    key: `report-${report.id}`,
    seenId: null,
    subject: report.targetLabel,
    meta: firstLine(report.reason),
    href: '/moderation/reports',
    at: formatTime(report.createdAt, now, t),
    isUnread: false,
    tag: t.t('board.notificationMenu.mod.report'),
  }
}

function firstLine(body: string): string {
  const line = body.split('\n', 1)[0] ?? ''
  return line.length > 140 ? `${line.slice(0, 139)}…` : line
}

export function buildNotificationMenuView(input: {
  readonly notifications: readonly NotificationView[]
  readonly notificationsUnread: number
  readonly messages: readonly MessageListRow[]
  readonly messagesUnread: number
  readonly moderation: ModerationSummary | null
  readonly now: Date
  readonly t?: Translator
}): NotificationMenuModel {
  const t = input.t ?? untranslated()

  const notificationsTab: NotificationMenuTab = {
    kind: 'notifications',
    label: t.t('board.notificationMenu.tab.notifications'),
    unread: input.notificationsUnread,
    rows: input.notifications
      .filter((row) => !row.isRead)
      .slice(0, NOTIFICATION_MENU_PREVIEW)
      .map((row) => notificationRow(row, input.now, t)),
    allHref: '/notifications',
    emptyLabel: t.t('board.notificationMenu.empty.notifications'),
  }

  const messagesTab: NotificationMenuTab = {
    kind: 'messages',
    label: t.t('board.notificationMenu.tab.messages'),
    unread: input.messagesUnread,
    rows: input.messages
      .filter((row) => row.readAt === null && row.role !== 'author')
      .slice(0, NOTIFICATION_MENU_PREVIEW)
      .map((row) => messageRow(row, input.now, t)),
    allHref: '/messages',
    emptyLabel: t.t('board.notificationMenu.empty.messages'),
  }

  const tabs: NotificationMenuTab[] = [notificationsTab, messagesTab]

  const moderationUnread =
    input.moderation === null ? 0 : input.moderation.pending + input.moderation.openReports

  if (input.moderation !== null) {
    const rows = [
      ...input.moderation.reports.map((report) => ({
        at: report.createdAt,
        row: reportRow(report, input.now, t),
      })),
      ...input.moderation.queue.map((item) => ({
        at: item.createdAt,
        row: queueRow(item, input.now, t),
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, NOTIFICATION_MENU_PREVIEW)
      .map((entry) => entry.row)

    tabs.push({
      kind: 'mod',
      label: t.t('board.notificationMenu.tab.mod'),
      unread: moderationUnread,
      rows,
      allHref: '/moderation',
      emptyLabel: t.t('board.notificationMenu.empty.mod'),
    })
  }

  return {
    total: input.notificationsUnread + input.messagesUnread + moderationUnread,
    tabs,
  }
}

export function notificationMenuCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    [
      'board.notificationMenu.trigger',
      'board.notificationMenu.heading',
      'board.notificationMenu.markSeen',
      'board.notificationMenu.markAllSeen',
      'board.notificationMenu.viewAll',
      'board.notificationMenu.close',
      'board.notificationMenu.unreadNotifications',
      'board.notificationMenu.unreadMessages',
      'board.notificationMenu.unreadMod',
      'board.notificationMenu.totalUnread',
      'form.working',
    ],
    t,
  )
}
