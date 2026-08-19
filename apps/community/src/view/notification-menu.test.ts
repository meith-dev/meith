import { describe, expect, it } from 'vitest'

import type { MessageListRow } from '@meith/messages'
import type { NotificationView } from '@meith/notifications'

import { buildNotificationMenuView, NOTIFICATION_MENU_PREVIEW } from './notification-menu'

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

function build(overrides: Partial<Parameters<typeof buildNotificationMenuView>[0]> = {}) {
  return buildNotificationMenuView({
    notifications: [notification()],
    notificationsUnread: 1,
    messages: [message()],
    messagesUnread: 1,
    canModerate: false,
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

  it('adds the mod tab for a moderator and routes staff notifications into it', () => {
    const view = build({
      notifications: [
        notification({ id: 1, kind: 'post.mentioned' }),
        notification({ id: 2, kind: 'system.task_failed', href: null, subject: 'A task failed' }),
      ],
      canModerate: true,
    })

    const kinds = view.tabs.map((tab) => tab.kind)
    expect(kinds).toEqual(['notifications', 'messages', 'mod'])

    const notifications = view.tabs.find((tab) => tab.kind === 'notifications')
    const mod = view.tabs.find((tab) => tab.kind === 'mod')
    expect(notifications?.rows.map((row) => row.seenId)).toEqual([1])
    expect(mod?.rows.map((row) => row.seenId)).toEqual([2])
    expect(mod?.allHref).toBe('/moderation')
  })

  it('keeps staff notifications out of the notifications tab even without a mod tab', () => {
    const view = build({
      notifications: [notification({ id: 2, kind: 'system.task_failed' })],
      canModerate: false,
    })
    const notifications = view.tabs.find((tab) => tab.kind === 'notifications')
    expect(notifications?.rows).toEqual([])
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
