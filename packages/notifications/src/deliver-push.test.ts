import { beforeEach, describe, expect, it } from 'vitest'

import { deliverNotificationPush, pushPayload } from './deliver-push'
import type { PushSendResult, VapidDetails } from './push'
import type {
  DeliverableNotification,
  NotificationRepository,
  PushSubscriptionRecord,
} from './types'

const VAPID: VapidDetails = {
  publicKey: 'public',
  privateKey: 'private',
  subject: 'mailto:board@example.test',
}

const AT = new Date('2026-07-31T12:00:00Z')

const DELIVERABLE: DeliverableNotification = {
  notification: {
    id: 12,
    userId: 1,
    kind: 'post.mentioned',
    data: { username: 'ivan', threadTitle: 'Saturday' },
    href: '/thread/4#post-9',
    occurrences: 1,
    createdAt: AT,
    updatedAt: AT,
    readAt: null,
  },
  recipient: { userId: 1, username: 'ivan', email: 'ivan@example.test', locale: 'en' },
  emailEnabled: false,
  emailSentAt: null,
  pushEnabled: true,
  pushSentAt: null,
}

function device(id: number): PushSubscriptionRecord {
  return {
    id,
    userId: 1,
    endpoint: `https://push.example/send/${id}`,
    p256dh: 'client-key',
    auth: 'shared-secret',
    createdAt: AT,
    lastSeenAt: AT,
  }
}

let deliverable: DeliverableNotification | null
let devices: PushSubscriptionRecord[]
let results: Record<string, PushSendResult>
let pruned: number[]
let touched: number[]
let marked: number[]
let payloads: string[]
let notifications: NotificationRepository

const SENT: PushSendResult = { outcome: 'sent', status: 201, error: null }
const GONE: PushSendResult = { outcome: 'gone', status: 410, error: 'HTTP 410' }
const FAILED: PushSendResult = { outcome: 'failed', status: 503, error: 'HTTP 503' }

beforeEach(() => {
  deliverable = DELIVERABLE
  devices = [device(1)]
  results = {}
  pruned = []
  touched = []
  marked = []
  payloads = []

  notifications = {
    findForDelivery: async () => deliverable,
    pushSubscriptionsFor: async () => devices,
    unreadCount: async () => 2,
    prunePushSubscription: async (id: number) => {
      pruned.push(id)
    },
    touchPushSubscription: async (id: number) => {
      touched.push(id)
    },
    markPushSent: async (id: number) => {
      marked.push(id)
    },
  } as unknown as NotificationRepository
})

function deliver() {
  return deliverNotificationPush({
    notifications,
    vapid: VAPID,
    notificationId: 12,
    now: () => AT,
    send: async (input) => {
      payloads.push(input.payload)
      return results[input.subscription.endpoint] ?? SENT
    },
  })
}

describe('delivering a push', () => {
  it('sends the rendered notification to every device the member subscribed', async () => {
    devices = [device(1), device(2)]

    const result = await deliver()

    expect(result).toMatchObject({ outcome: 'sent', sent: 2, pruned: 0, failed: 0 })
    expect(touched).toEqual([1, 2])
    expect(marked).toEqual([12])
    expect(JSON.parse(payloads[0]!)).toMatchObject({
      id: 12,
      href: '/thread/4#post-9',
      badge: 2,
    })
  })

  it('sends nothing for a notification that is gone', async () => {
    deliverable = null
    expect(await deliver()).toMatchObject({ outcome: 'missing', sent: 0 })
  })

  it('sends nothing twice', async () => {
    deliverable = { ...DELIVERABLE, pushSentAt: AT }
    expect(await deliver()).toMatchObject({ outcome: 'already-sent', sent: 0 })
  })

  it('sends nothing for a kind the member turned off', async () => {
    deliverable = { ...DELIVERABLE, pushEnabled: false }
    expect(await deliver()).toMatchObject({ outcome: 'declined', sent: 0 })
    expect(payloads).toEqual([])
  })

  it('sends nothing to a member with no subscribed browser', async () => {
    devices = []
    expect(await deliver()).toMatchObject({ outcome: 'unsubscribed', sent: 0 })
  })

  it('forgets the endpoints a push service has given up on', async () => {
    devices = [device(1), device(2)]
    results[device(2).endpoint] = GONE

    const result = await deliver()

    expect(result).toMatchObject({ sent: 1, pruned: 1 })
    expect(pruned).toEqual([2])
    expect(marked).toEqual([12])
  })

  it('keeps a subscription a push service merely refused this once', async () => {
    devices = [device(1), device(2)]
    results[device(2).endpoint] = FAILED

    const result = await deliver()

    expect(result).toMatchObject({ sent: 1, failed: 1, pruned: 0 })
    expect(pruned).toEqual([])
  })

  it('asks to be retried when nothing got through', async () => {
    results[device(1).endpoint] = FAILED

    await expect(deliver()).rejects.toThrow(/refused notification 12/)
    expect(marked).toEqual([])
  })
})

describe('the payload', () => {
  it('collapses the body to one line and keeps it small', () => {
    const payload = JSON.parse(
      pushPayload({
        notificationId: 3,
        title: 'A reply',
        body: '  two   lines\nof body  ',
        href: '/thread/1',
        badge: 0,
      }),
    )

    expect(payload.body).toBe('two lines of body')
  })

  it('cuts a long body down to what a notification can show', () => {
    const payload = JSON.parse(
      pushPayload({
        notificationId: 3,
        title: 'A reply',
        body: 'x'.repeat(5000),
        href: '/thread/1',
        badge: 0,
      }),
    )

    expect(payload.body).toHaveLength(300)
    expect(payload.href).toBe('/thread/1')
  })

  it('drops the body rather than sending a payload no push service would carry', () => {
    const payload = JSON.parse(
      pushPayload({
        notificationId: 3,
        title: 'A reply, quoted at length: ' + 'x'.repeat(4000),
        body: 'the body',
        href: '/thread/1',
        badge: 0,
      }),
    )

    expect(payload.body).toBe('')
    expect(payload.title).toHaveLength(300)
  })
})
