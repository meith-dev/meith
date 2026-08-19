import { describe, expect, it } from 'vitest'

import type { MessageListRow } from '@meith/messages'
import type { QueueItem, ReportRow } from '@meith/moderation'
import type { NotificationView } from '@meith/notifications'

import {
  buildNotificationMenuView,
  type ModerationSummary,
  NOTIFICATION_MENU_PREVIEW,
} from './notification-menu'

const NOW = new Date('2026-08-01T12:00:00Z')

function notification(overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    id: 1,
    subject: 'You were mentioned',
    body: '',
    href: '/thread/1-hello',
    kind: 'post.mentioned',
    occurrences: 1,
    createdAt: new Date('2026-08-01T11:00:00Z'),
    updatedAt: new Date('2026-08-01T11:00:00Z'),
    isRead: false,
    unsubscribeToken: null,
    ...overrides,
  }
}

function message(overrides: Partial<MessageListRow> = {}): MessageListRow {
  return {
    copyId: 5,
    messageId: 50,
    folder: 'inbox',
    role: 'to',
    subject: 'Hello',
    sentAt: new Date('2026-08-01T11:30:00Z'),
    readAt: null,
    counterparties: ['ivan'],
    moreCounterparties: 0,
    ...overrides,
  }
}

function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    kind: 'thread',
    id: 3,
    forumId: 7,
    forumTitle: 'Buy, sell and swap',
    threadId: 30,
    threadSlug: 'cheap-jerseys',
    threadTitle: 'cheap replica jerseys',
    authorUserId: 99,
    authorUsername: 'ticket_deals_2026',
    excerpt: 'official quality replica jerseys all clubs',
    createdAt: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  }
}

function report(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 4,
    kind: 'post',
    targetId: 40,
    forumId: 7,
    threadId: 30,
    targetLabel: 'A rude reply',
    reporterUserId: 12,
    reporterUsername: 'member',
    reason: 'This is spam',
    status: 'open',
    assignedToUserId: null,
    assignedToUsername: null,
    createdAt: new Date('2026-08-01T11:45:00Z'),
    ...overrides,
  }
}

function moderation(overrides: Partial<ModerationSummary> = {}): ModerationSummary {
  return {
    queue: [queueItem()],
    reports: [report()],
    pending: 1,
    openReports: 2,
    ...overrides,
  }
}

function build(overrides: Partial<Parameters<typeof buildNotificationMenuView>[0]> = {}) {
  return buildNotificationMenuView({
    notifications: [notification()],
    notificationsUnread: 1,
    messages: [message()],
    messagesUnread: 1,
    moderation: null,
    now: NOW,
    ...overrides,
  })
}

describe('buildNotificationMenuView', () => {
  it('totals the badge across notifications and messages', () => {
    const view = build({ notificationsUnread: 3, messagesUnread: 2 })
    expect(view.total).toBe(5)
  })

  it('offers only the notifications and messages tabs to an ordinary member', () => {
    const view = build()
    expect(view.tabs.map((tab) => tab.kind)).toEqual(['notifications', 'messages'])
  })

  it('shows every notification kind in the notifications tab', () => {
    const view = build({
      notifications: [
        notification({ id: 1, kind: 'post.mentioned' }),
        notification({ id: 2, kind: 'system.task_failed', href: null, subject: 'A task failed' }),
      ],
    })
    const notifications = view.tabs.find((tab) => tab.kind === 'notifications')
    expect(notifications?.rows.map((row) => row.seenId)).toEqual([1, 2])
  })

  it('adds a mod tab of the queue and open reports for a moderator', () => {
    const view = build({ moderation: moderation() })

    expect(view.tabs.map((tab) => tab.kind)).toEqual(['notifications', 'messages', 'mod'])

    const mod = view.tabs.find((tab) => tab.kind === 'mod')
    expect(mod?.unread).toBe(3)
    expect(mod?.allHref).toBe('/moderation')
    expect(mod?.rows.map((row) => row.href)).toEqual(['/moderation/reports', '/moderation'])
    expect(mod?.rows.every((row) => row.seenId === null)).toBe(true)
  })

  it('counts the moderation queue and reports into the badge total', () => {
    const view = build({
      notificationsUnread: 1,
      messagesUnread: 2,
      moderation: moderation({ pending: 1, openReports: 2 }),
    })
    expect(view.total).toBe(6)
  })

  it('orders mod rows newest first across the queue and reports', () => {
    const view = build({
      moderation: moderation({
        queue: [queueItem({ id: 1, createdAt: new Date('2026-08-01T09:00:00Z') })],
        reports: [report({ id: 2, createdAt: new Date('2026-08-01T11:00:00Z') })],
      }),
    })
    const mod = view.tabs.find((tab) => tab.kind === 'mod')
    expect(mod?.rows.map((row) => row.tag)).toEqual(['Report', 'Awaiting approval'])
  })

  it('caps each tab at the preview size', () => {
    const many = Array.from({ length: NOTIFICATION_MENU_PREVIEW + 4 }, (_, index) =>
      notification({ id: index + 1 }),
    )
    const view = build({ notifications: many })
    const notifications = view.tabs.find((tab) => tab.kind === 'notifications')
    expect(notifications?.rows).toHaveLength(NOTIFICATION_MENU_PREVIEW)
  })

  it('links a message row through to the message and marks it unread by copy id', () => {
    const view = build({ messages: [message({ copyId: 9, messageId: 90 })] })
    const messages = view.tabs.find((tab) => tab.kind === 'messages')
    const row = messages?.rows[0]
    expect(row?.href).toBe('/messages/90')
    expect(row?.seenId).toBe(9)
    expect(row?.isUnread).toBe(true)
  })

  it('treats a message the viewer authored as already seen', () => {
    const view = build({ messages: [message({ role: 'author', readAt: null })] })
    const messages = view.tabs.find((tab) => tab.kind === 'messages')
    expect(messages?.rows[0]?.isUnread).toBe(false)
  })
})
