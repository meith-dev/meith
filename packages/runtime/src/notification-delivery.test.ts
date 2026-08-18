import { beforeEach, describe, expect, it } from 'vitest'

import { MemoryMailDriver, MemoryQueue } from '@meith/drivers'
import type { OutboxReader, OutboxRecord } from '@meith/events'
import { buildMailBrand } from '@meith/mail'
import {
  type DeliverableNotification,
  deliverNotificationEmail,
  deliverNotificationPush,
  type NotificationRepository,
  type PushSendResult,
  type PushSubscriptionRecord,
  type VapidDetails,
} from '@meith/notifications'

import { buildEventRegistry } from './event-handlers'
import { defaultPromotionGuards, taskWorkers } from './task-workers'

const NOT_ABORTED = new AbortController().signal

class FakeOutbox implements OutboxReader {
  readonly marked: number[] = []
  constructor(private rows: OutboxRecord[]) {}

  async claimUnrelayed(limit: number): Promise<OutboxRecord[]> {
    const batch = this.rows.slice(0, limit)
    this.rows = this.rows.slice(limit)
    return batch
  }

  async markRelayed(ids: number[]): Promise<void> {
    this.marked.push(...ids)
  }
}

function notificationCreated(id: number, notificationId: number): OutboxRecord {
  return {
    id,
    name: 'notification.created',
    payload: { notificationId, userId: 1, kind: 'warning.received' },
    dedupeKey: null,
    createdAt: new Date(),
    relayedAt: null,
  }
}

const DELIVERABLE: DeliverableNotification = {
  notification: {
    id: 55,
    userId: 1,
    kind: 'warning.received',
    data: { title: 'Spamming', points: 2, totalPoints: 2 },
    href: null,
    occurrences: 1,
    createdAt: new Date('2026-07-31T12:00:00Z'),
    updatedAt: new Date('2026-07-31T12:00:00Z'),
    readAt: null,
  },
  recipient: { userId: 1, username: 'ivan', email: 'ivan@example.test', locale: 'en' },
  emailEnabled: true,
  emailSentAt: null,
  pushEnabled: false,
  pushSentAt: null,
}

const unusedDeps = {
  bans: {} as never,
  promotions: {} as never,
  guards: defaultPromotionGuards(),
  maintenance: {
    pruneSessions: async () => 0,
    pruneExpiredTokens: async () => 0,
  },
  recount: { run: async () => ({ corrected: 0 }) },
  threadViews: { flush: async () => 0 },
  renderBackfill: { run: async () => ({ rendered: 0 }) },
  warnings: null as never,
}

const VAPID: VapidDetails = {
  publicKey: 'public',
  privateKey: 'private',
  subject: 'mailto:board@example.test',
}

const SUBSCRIPTION: PushSubscriptionRecord = {
  id: 9,
  userId: 1,
  endpoint: 'https://push.example/send/abc',
  p256dh: 'p256dh',
  auth: 'auth',
  createdAt: new Date('2026-07-31T12:00:00Z'),
  lastSeenAt: new Date('2026-07-31T12:00:00Z'),
}

let mail: MemoryMailDriver
let sentIds: number[]
let pushedIds: number[]
let pushed: string[]
let pruned: number[]
let pushResult: PushSendResult
let subscriptions: PushSubscriptionRecord[]
let deliverable: DeliverableNotification
let notifications: NotificationRepository

function build(rows: OutboxRecord[], withMail = true) {
  const queue = new MemoryQueue()
  const outbox = new FakeOutbox(rows)
  const workers = taskWorkers({
    ...unusedDeps,
    queue,
    outbox,
    events: buildEventRegistry({
      counters: { rollUpAncestors: async () => true, applyVisibilityChange: async () => false },
      ...(withMail
        ? {
            notifications: {
              async deliverEmail(notificationId: number) {
                await deliverNotificationEmail({
                  notifications,
                  mail,
                  brand: buildMailBrand({
                    boardName: 'Test Board',
                    fromName: 'The Test Board',
                    boardUrl: 'https://board.example',
                    tokens: null,
                  }),
                  notificationId,
                })
              },
              async deliverPush(notificationId: number) {
                await deliverNotificationPush({
                  notifications,
                  vapid: VAPID,
                  notificationId,
                  send: async (input) => {
                    pushed.push(input.payload)
                    return pushResult
                  },
                })
              },
            },
          }
        : {}),
    }),
  })
  return { queue, outbox, workers }
}

beforeEach(() => {
  mail = new MemoryMailDriver()
  sentIds = []
  pushedIds = []
  pushed = []
  pruned = []
  subscriptions = [SUBSCRIPTION]
  deliverable = DELIVERABLE
  pushResult = { outcome: 'sent', status: 201, error: null }
  notifications = {
    findForDelivery: async () => deliverable,
    markEmailSent: async (id: number) => {
      sentIds.push(id)
    },
    markPushSent: async (id: number) => {
      pushedIds.push(id)
    },
    unreadCount: async () => 3,
    pushSubscriptionsFor: async () => subscriptions,
    touchPushSubscription: async () => {},
    prunePushSubscription: async (id: number) => {
      pruned.push(id)
    },
  } as unknown as NotificationRepository
})

describe('the notification mail path', () => {
  it('carries a committed notification through to a sent message', async () => {
    const { workers, outbox } = build([notificationCreated(1, 55)])

    expect(await workers.relayOutbox!(10)).toBe(1)
    expect(outbox.marked).toEqual([1])

    expect(await workers.drainQueue!(10, NOT_ABORTED)).toBe(2)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]?.to).toBe('ivan@example.test')
    expect(mail.sent[0]?.subject).toBe('[Test Board] You have been warned: Spamming')
    expect(mail.sent[0]?.fromName).toBe('The Test Board')
    expect(sentIds).toEqual([55])
  })

  it('sends nothing on a build with no mail driver, and enqueues nothing either', async () => {
    const { workers, queue } = build([notificationCreated(1, 55)], false)

    expect(await workers.relayOutbox!(10)).toBe(1)
    expect(await workers.drainQueue!(10, NOT_ABORTED)).toBe(0)
    expect(mail.sent).toHaveLength(0)
    expect((await queue.deadLettered(10)).length).toBe(0)
  })

  it('does not resend a notification whose message already went', async () => {
    deliverable = { ...DELIVERABLE, emailSentAt: new Date() }

    const { workers } = build([notificationCreated(1, 55)])
    await workers.relayOutbox!(10)
    await workers.drainQueue!(10, NOT_ABORTED)

    expect(mail.sent).toHaveLength(0)
  })
})

describe('the notification push path', () => {
  beforeEach(() => {
    deliverable = { ...DELIVERABLE, pushEnabled: true }
  })

  it('carries the same committed notification through to a pushed device', async () => {
    const { workers } = build([notificationCreated(1, 55)])

    await workers.relayOutbox!(10)
    expect(await workers.drainQueue!(10, NOT_ABORTED)).toBe(2)

    expect(pushed).toHaveLength(1)
    expect(JSON.parse(pushed[0]!)).toMatchObject({
      id: 55,
      title: 'You have been warned: Spamming',
      badge: 3,
    })
    expect(pushedIds).toEqual([55])
  })

  it('pushes nothing for a member who declined the kind', async () => {
    deliverable = { ...DELIVERABLE, pushEnabled: false }

    const { workers } = build([notificationCreated(1, 55)])
    await workers.relayOutbox!(10)
    await workers.drainQueue!(10, NOT_ABORTED)

    expect(pushed).toHaveLength(0)
    expect(pushedIds).toEqual([])
  })

  it('forgets a subscription the push service says is gone', async () => {
    pushResult = { outcome: 'gone', status: 410, error: 'HTTP 410' }

    const { workers } = build([notificationCreated(1, 55)])
    await workers.relayOutbox!(10)
    await workers.drainQueue!(10, NOT_ABORTED)

    expect(pruned).toEqual([9])
  })

  it('leaves the job to be retried when every push service refused', async () => {
    pushResult = { outcome: 'failed', status: 503, error: 'HTTP 503' }

    const { workers, queue } = build([notificationCreated(1, 55)])
    await workers.relayOutbox!(10)

    expect(await workers.drainQueue!(10, NOT_ABORTED)).toBe(1)
    expect(pushedIds).toEqual([])
    expect(pruned).toEqual([])
    expect(await queue.deadLettered(10)).toHaveLength(0)
  })
})
