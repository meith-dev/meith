import type { Translator } from '@meith/i18n'
import type { MessageListRow } from '@meith/messages'
import {
  type NotificationAudience,
  type NotificationView,
  notificationKind,
} from '@meith/notifications'
import type { TimeModel } from '@meith/theme-kit'

import { copyFor } from './copy'
import { formatTime, untranslated } from './time'

export const NOTIFICATION_MENU_PREVIEW = 6

export type NotificationMenuTabKind = 'notifications' | 'messages' | 'mod'

export interface NotificationMenuRow {
  readonly key: string
  readonly seenId: number
  readonly subject: string
  readonly meta: string | null
  readonly href: string | null
  readonly at: TimeModel
  readonly isUnread: boolean
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

function audienceOf(kind: string): NotificationAudience {
  return notificationKind(kind)?.audience ?? 'member'
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
  readonly canModerate: boolean
  readonly now: Date
  readonly t?: Translator
}): NotificationMenuModel {
  const t = input.t ?? untranslated()

  const member = input.notifications.filter((row) => audienceOf(row.kind) === 'member')
  const staff = input.notifications.filter((row) => audienceOf(row.kind) === 'staff')

  const notificationsTab: NotificationMenuTab = {
    kind: 'notifications',
    label: t.t('board.notificationMenu.tab.notifications'),
    unread: input.notificationsUnread,
    rows: member
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
      .slice(0, NOTIFICATION_MENU_PREVIEW)
      .map((row) => messageRow(row, input.now, t)),
    allHref: '/messages',
    emptyLabel: t.t('board.notificationMenu.empty.messages'),
  }

  const tabs: NotificationMenuTab[] = [notificationsTab, messagesTab]

  if (input.canModerate) {
    tabs.push({
      kind: 'mod',
      label: t.t('board.notificationMenu.tab.mod'),
      unread: staff.filter((row) => !row.isRead).length,
      rows: staff
        .slice(0, NOTIFICATION_MENU_PREVIEW)
        .map((row) => notificationRow(row, input.now, t)),
      allHref: '/moderation',
      emptyLabel: t.t('board.notificationMenu.empty.mod'),
    })
  }

  return {
    total: input.notificationsUnread + input.messagesUnread,
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
      'board.notificationMenu.new',
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
