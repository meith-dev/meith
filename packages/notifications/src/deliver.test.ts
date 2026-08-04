/**
 * F55 — delivery, and the four answers it can give.
 *
 * Three of them send nothing and none of them throws, because a throw here is a
 * queue retry: retrying a decision that will be identical every time is how a
 * job reaches its dead letter for no reason at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MailDriver, OutgoingMail } from '@meith/core'

import { deliverNotificationEmail } from './deliver'
import type { DeliverableNotification, NotificationRepository } from './types'

const BRAND = { boardName: 'Test Board', boardUrl: 'https://board.example', accent: '#123456' }

class CollectingMail implements MailDriver {
  readonly sent: OutgoingMail[] = []
  fail = false

  async send(mail: OutgoingMail): Promise<void> {
    if (this.fail) throw new Error('provider down')
    this.sent.push(mail)
  }
}

const DELIVERABLE: DeliverableNotification = {
  notification: {
    id: 4,
    userId: 1,
    kind: 'warning.received',
    data: { title: 'Spamming', points: 2, totalPoints: 2 },
    href: null,
    occurrences: 1,
    createdAt: new Date('2026-07-31T10:00:00Z'),
    updatedAt: new Date('2026-07-31T10:00:00Z'),
    readAt: null,
  },
  recipient: { userId: 1, username: 'ivan', email: 'ivan@example.test' },
  emailEnabled: true,
  emailSentAt: null,
}

let mail: CollectingMail
let found: DeliverableNotification | null
let marked: number[]
let notifications: NotificationRepository

beforeEach(() => {
  mail = new CollectingMail()
  found = DELIVERABLE
  marked = []
  notifications = {
    findForDelivery: async () => found,
    markEmailSent: async (id: number) => {
      marked.push(id)
    },
  } as unknown as NotificationRepository
})

function deliver() {
  return deliverNotificationEmail({ notifications, mail, brand: BRAND, notificationId: 4 })
}

it('sends the message and records that it went', async () => {
  expect(await deliver()).toBe('sent')
  expect(mail.sent[0]?.to).toBe('ivan@example.test')
  expect(mail.sent[0]?.subject).toContain('[Test Board]')
  expect(marked).toEqual([4])
})

it('sends nothing for a notification that no longer exists', async () => {
  found = null
  expect(await deliver()).toBe('missing')
  expect(mail.sent).toHaveLength(0)
})

it('sends nothing when the recipient turned the kind off after it was raised', async () => {
  found = { ...DELIVERABLE, emailEnabled: false }
  expect(await deliver()).toBe('declined')
  expect(mail.sent).toHaveLength(0)
})

it('sends nothing a second time when a message already went', async () => {
  found = { ...DELIVERABLE, emailSentAt: new Date('2026-07-31T10:05:00Z') }
  expect(await deliver()).toBe('already-sent')
  expect(mail.sent).toHaveLength(0)
})

it('propagates a driver failure, because that is the one worth retrying', async () => {
  mail.fail = true
  await expect(deliver()).rejects.toThrow('provider down')
  /* And does not claim it was sent, so the retry actually sends it. */
  expect(marked).toEqual([])
})

it('marks after sending, never before', async () => {
  const order: string[] = []
  const send = vi.spyOn(mail, 'send').mockImplementation(async () => {
    order.push('send')
  })
  notifications.markEmailSent = async () => {
    order.push('mark')
  }

  await deliver()

  expect(order).toEqual(['send', 'mark'])
  send.mockRestore()
})

describe('the mutant this kills', () => {
  it('a delivery that ignored emailSentAt would send a duplicate on every retry', async () => {
    found = { ...DELIVERABLE, emailSentAt: new Date() }
    await deliver()
    await deliver()
    expect(mail.sent).toHaveLength(0)
  })
})
