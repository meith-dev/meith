import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_STAFF_FANOUT, NotificationService } from './service'
import type {
  DeliverableNotification,
  NotificationChannel,
  NotificationChannelPreference,
  NotificationRecord,
  NotificationRepository,
  PushSubscriptionRecord,
  RaiseInput,
  RaiseResult,
  SavePushSubscriptionInput,
} from './types'

class MemoryNotifications implements NotificationRepository {
  readonly raised: RaiseInput[] = []
  readonly rows: NotificationRecord[] = []
  readonly preferences = new Map<number, Map<string, NotificationChannelPreference>>()
  readonly subscriptions: PushSubscriptionRecord[] = []
  readonly pushSent: number[] = []
  administrators: number[] = []
  private nextId = 1
  private readonly dedupe = new Map<string, number>()

  async raise(input: RaiseInput): Promise<RaiseResult> {
    this.raised.push(input)

    const key = input.dedupeKey === null ? null : `${input.userId}:${input.dedupeKey}`
    const existing = key === null ? undefined : this.dedupe.get(key)

    if (existing !== undefined) {
      const row = this.rows.find((r) => r.id === existing)!
      const bumped = { ...row, occurrences: row.occurrences + 1, updatedAt: input.at }
      this.rows[this.rows.indexOf(row)] = bumped
      return { notificationId: existing, coalesced: true, emailQueued: false, pushQueued: false }
    }

    const id = this.nextId++
    this.rows.push({
      id,
      userId: input.userId,
      kind: input.kind,
      data: input.data,
      href: input.href ?? null,
      occurrences: 1,
      createdAt: input.at,
      updatedAt: input.at,
      readAt: null,
    })
    if (key !== null) this.dedupe.set(key, id)
    return {
      notificationId: id,
      coalesced: false,
      emailQueued: input.email,
      pushQueued: input.push,
    }
  }

  async listFor(userId: number, options: { limit: number; after?: string }) {
    const mine = this.rows.filter((r) => r.userId === userId).reverse()
    const start = options.after === undefined ? 0 : Number(options.after)
    const page = mine.slice(start, start + options.limit)
    return mine.length > start + options.limit
      ? { rows: page, nextCursor: String(start + options.limit) }
      : { rows: page }
  }

  async unreadCount(userId: number): Promise<number> {
    return this.rows.filter((r) => r.userId === userId && r.readAt === null).length
  }

  async countFor(userId: number): Promise<number> {
    return this.rows.filter((r) => r.userId === userId).length
  }

  async markRead(userId: number, id: number): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId && r.readAt === null)
    if (row === undefined) return false
    this.rows[this.rows.indexOf(row)] = { ...row, readAt: new Date() }
    return true
  }

  async markAllRead(userId: number): Promise<number> {
    let count = 0
    for (const [index, row] of this.rows.entries()) {
      if (row.userId === userId && row.readAt === null) {
        this.rows[index] = { ...row, readAt: new Date() }
        count += 1
      }
    }
    return count
  }

  async preferencesFor(
    userId: number,
  ): Promise<ReadonlyMap<string, NotificationChannelPreference>> {
    return this.preferences.get(userId) ?? new Map()
  }

  async savePreferences(
    userId: number,
    channel: NotificationChannel,
    entries: ReadonlyMap<string, boolean>,
  ) {
    const stored = this.preferences.get(userId) ?? new Map()
    for (const [kind, on] of entries) {
      const current = stored.get(kind) ?? { email: null, push: null }
      stored.set(kind, channel === 'email' ? { ...current, email: on } : { ...current, push: on })
    }
    this.preferences.set(userId, stored)
  }

  async findForDelivery(): Promise<DeliverableNotification | null> {
    return null
  }

  async markEmailSent(): Promise<void> {}

  async markPushSent(notificationId: number): Promise<void> {
    this.pushSent.push(notificationId)
  }

  async savePushSubscription(input: SavePushSubscriptionInput): Promise<void> {
    const existing = this.subscriptions.findIndex((row) => row.endpoint === input.endpoint)
    const row = {
      id: existing === -1 ? this.subscriptions.length + 1 : this.subscriptions[existing]!.id,
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      createdAt: input.at,
      lastSeenAt: input.at,
    }
    if (existing === -1) this.subscriptions.push(row)
    else this.subscriptions[existing] = row
  }

  async removePushSubscription(userId: number, endpoint: string): Promise<boolean> {
    const index = this.subscriptions.findIndex(
      (row) => row.userId === userId && row.endpoint === endpoint,
    )
    if (index === -1) return false
    this.subscriptions.splice(index, 1)
    return true
  }

  async pushSubscriptionsFor(userId: number): Promise<readonly PushSubscriptionRecord[]> {
    return this.subscriptions.filter((row) => row.userId === userId)
  }

  async countPushSubscriptions(userId: number): Promise<number> {
    return this.subscriptions.filter((row) => row.userId === userId).length
  }

  async prunePushSubscription(id: number): Promise<void> {
    const index = this.subscriptions.findIndex((row) => row.id === id)
    if (index !== -1) this.subscriptions.splice(index, 1)
  }

  async touchPushSubscription(id: number, at: Date): Promise<void> {
    const index = this.subscriptions.findIndex((row) => row.id === id)
    if (index !== -1) this.subscriptions[index] = { ...this.subscriptions[index]!, lastSeenAt: at }
  }

  async administratorIds(limit: number): Promise<readonly number[]> {
    return this.administrators.slice(0, limit)
  }
}

let repo: MemoryNotifications
let service: NotificationService

beforeEach(() => {
  repo = new MemoryNotifications()
  service = new NotificationService({
    notifications: repo,
    now: () => new Date('2026-07-31T12:00:00Z'),
  })
})

describe('raising', () => {
  it('queues mail for a kind that is on by default', async () => {
    const result = await service.raise({
      userId: 1,
      kind: 'warning.received',
      data: { title: 'Spamming', points: 2, totalPoints: 2 },
    })

    expect(result.emailQueued).toBe(true)
    expect(repo.raised[0]?.email).toBe(true)
  })

  it('does not queue mail for a kind that is off by default', async () => {
    const result = await service.raise({
      userId: 1,
      kind: 'report.actioned',
      data: { outcome: 'resolved' },
    })

    expect(result.emailQueued).toBe(false)
  })

  it('honours a stored preference over the registry default', async () => {
    repo.preferences.set(1, new Map([['warning.received', { email: false, push: null }]]))

    const result = await service.raise({
      userId: 1,
      kind: 'warning.received',
      data: {},
    })

    expect(result.emailQueued).toBe(false)
  })

  it('sends one e-mail for a repeated notification, not one per occurrence', async () => {
    const results = []
    for (let i = 0; i < 5; i += 1) {
      results.push(
        await service.raise({
          userId: 1,
          kind: 'system.task_failed',
          data: { taskId: 'queue.drain', error: `attempt ${i}` },
          dedupeKey: 'system.task_failed:queue.drain',
        }),
      )
    }

    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]?.occurrences).toBe(5)
    expect(results.filter((r) => r.emailQueued)).toHaveLength(1)
    expect(results.filter((r) => r.coalesced)).toHaveLength(4)
  })

  it('starts a new notification once the coalesced one has been read', async () => {
    const first = await service.raise({
      userId: 1,
      kind: 'system.task_failed',
      data: { taskId: 'queue.drain' },
      dedupeKey: 'system.task_failed:queue.drain',
    })
    await service.markRead(1, first.notificationId)

    const second = await service.raise({
      userId: 1,
      kind: 'system.task_failed',
      data: { taskId: 'queue.drain' },
      dedupeKey: 'system.task_failed:queue.drain',
    })
    expect(repo.raised[1]?.dedupeKey).toBe('system.task_failed:queue.drain')
    expect(second.notificationId).toBe(first.notificationId)
  })
})

describe('kinds registered at runtime', () => {
  const PLUGIN_KIND = {
    id: 'plugin.dues.gift_received',
    title: 'A gift arrives',
    description: 'Somebody bought a membership for you.',
    audience: 'member' as const,
    emailByDefault: true,
    emailConfigurable: true as const,
    pushByDefault: false,
    pushConfigurable: true as const,
  }

  it('raises a registered kind, honouring its email default and the member override', async () => {
    const repo = new MemoryNotifications()
    const service = new NotificationService({ notifications: repo, extraKinds: [PLUGIN_KIND] })

    await service.raise({
      userId: 7,
      kind: 'plugin.dues.gift_received',
      data: { subject: 'A gift for you' },
    })
    expect(repo.raised[0]).toMatchObject({ kind: 'plugin.dues.gift_received', email: true })

    repo.preferences.set(7, new Map([['plugin.dues.gift_received', { email: false, push: null }]]))
    await service.raise({
      userId: 7,
      kind: 'plugin.dues.gift_received',
      data: { subject: 'Another' },
    })
    expect(repo.raised[1]).toMatchObject({ email: false })
  })

  it('still refuses a kind nobody registered', async () => {
    const service = new NotificationService({
      notifications: new MemoryNotifications(),
      extraKinds: [PLUGIN_KIND],
    })
    await expect(service.raise({ userId: 7, kind: 'plugin.dues.other', data: {} })).rejects.toThrow(
      /Unknown notification kind/,
    )
  })

  it('lists the registered kind on the member preferences screen and saves its toggle', async () => {
    const repo = new MemoryNotifications()
    const service = new NotificationService({ notifications: repo, extraKinds: [PLUGIN_KIND] })

    const prefs = await service.preferences(7, 'member')
    expect(prefs.some((row) => row.kind === 'plugin.dues.gift_received')).toBe(true)

    await service.savePreferences(7, 'member', [])
    expect(repo.preferences.get(7)?.get('plugin.dues.gift_received')?.email).toBe(false)
  })

  it('refuses an unnamespaced registration and a collision with a built-in', () => {
    const repo = new MemoryNotifications()
    expect(
      () =>
        new NotificationService({
          notifications: repo,
          extraKinds: [{ ...PLUGIN_KIND, id: 'sneaky.kind' }],
        }),
    ).toThrow(/namespaced/)
    expect(
      () =>
        new NotificationService({
          notifications: repo,
          extraKinds: [PLUGIN_KIND, PLUGIN_KIND],
        }),
    ).toThrow(/twice/)
  })
})

describe('the administrator fan-out', () => {
  it('raises one notification per administrator', async () => {
    repo.administrators = [1, 2, 3]

    const { raised } = await service.raiseForAdministrators({
      kind: 'system.task_failed',
      data: { taskId: 'outbox.relay' },
      dedupeKey: 'system.task_failed:outbox.relay',
    })

    expect(raised).toBe(3)
    expect(repo.rows.map((r) => r.userId)).toEqual([1, 2, 3])
  })

  it('is bounded: a board with thousands of administrators writes at most the ceiling', async () => {
    repo.administrators = Array.from({ length: 5_000 }, (_, i) => i + 1)

    const { raised } = await service.raiseForAdministrators({
      kind: 'system.task_failed',
      data: { taskId: 'outbox.relay' },
    })

    expect(raised).toBe(MAX_STAFF_FANOUT)
  })

  it('keeps notifying the rest when one recipient fails', async () => {
    repo.administrators = [1, 2, 3]
    const original = repo.raise.bind(repo)
    let calls = 0
    repo.raise = async (input) => {
      calls += 1
      if (calls === 2) throw new Error('constraint violation')
      return original(input)
    }

    const { raised } = await service.raiseForAdministrators({
      kind: 'system.task_failed',
      data: { taskId: 'outbox.relay' },
    })

    expect(raised).toBe(2)
  })
})

describe('preferences', () => {
  it('shows registry defaults to a member who has never saved', async () => {
    const rows = await service.preferences(1, 'member')

    expect(rows.map((r) => [r.kind, r.email, r.isDefault])).toEqual([
      ['warning.received', true, true],
      ['report.actioned', false, true],
      ['subscription.reply', true, true],
      ['subscription.digest', true, true],
      ['board.digest', false, true],
      ['post.mentioned', true, true],
      ['post.quoted', false, true],
      ['pm.received', true, true],
      ['pm.receipt', false, true],
    ])
  })

  it('shows a stored override and marks it as not a default', async () => {
    repo.preferences.set(1, new Map([['warning.received', { email: false, push: null }]]))

    const rows = await service.preferences(1, 'member')
    const warning = rows.find((r) => r.kind === 'warning.received')

    expect(warning?.email).toBe(false)
    expect(warning?.isDefault).toBe(false)
  })

  it('offers a member only member kinds', async () => {
    const rows = await service.preferences(1, 'member')
    expect(rows.map((r) => r.kind)).not.toContain('system.task_failed')
  })

  it('writes false for the boxes a no-JS form left out', async () => {
    await service.savePreferences(1, 'member', ['report.actioned'])

    const stored = repo.preferences.get(1)
    expect(stored?.get('warning.received')?.email).toBe(false)
    expect(stored?.get('report.actioned')?.email).toBe(true)
  })

  it('cannot write a kind outside the submitted audience', async () => {
    await service.savePreferences(1, 'member', ['system.task_failed'])

    const stored = repo.preferences.get(1)
    expect(stored?.has('system.task_failed')).toBe(false)
  })
})

describe('reading', () => {
  it('renders the stored rows rather than returning them raw', async () => {
    await service.raise({
      userId: 1,
      kind: 'warning.received',
      data: { title: 'Spamming', points: 2, totalPoints: 4 },
    })

    const page = await service.list(1)
    expect(page.rows[0]?.subject).toBe('You have been warned: Spamming')
    expect(page.rows[0]?.body).toContain('Your total is now 4 points')
  })

  it('marking all read clears the unread count', async () => {
    await service.raise({ userId: 1, kind: 'warning.received', data: {} })
    await service.raise({ userId: 1, kind: 'report.actioned', data: {} })

    expect(await service.unreadCount(1)).toBe(2)
    expect(await service.markAllRead(1)).toBe(2)
    expect(await service.unreadCount(1)).toBe(0)
  })
})

describe('push', () => {
  const DEVICE = {
    userId: 1,
    endpoint: 'https://push.example/send/abc',
    p256dh: 'client-key',
    auth: 'shared-secret',
  }

  it('queues no push for a member with no subscribed browser', async () => {
    const result = await service.raise({ userId: 1, kind: 'pm.received', data: {} })

    expect(result.pushQueued).toBe(false)
    expect(repo.raised[0]?.push).toBe(false)
  })

  it('queues a push once a browser is subscribed and the kind is on by default', async () => {
    await service.subscribeToPush(DEVICE)

    const result = await service.raise({ userId: 1, kind: 'pm.received', data: {} })

    expect(result.pushQueued).toBe(true)
  })

  it('honours a kind the member turned off, subscribed or not', async () => {
    await service.subscribeToPush(DEVICE)
    await service.savePreferences(1, 'member', [], 'push')

    const result = await service.raise({ userId: 1, kind: 'pm.received', data: {} })

    expect(result.pushQueued).toBe(false)
  })

  it('leaves the e-mail preference alone when the push boxes are saved', async () => {
    await service.savePreferences(1, 'member', ['pm.received'], 'email')
    await service.savePreferences(1, 'member', [], 'push')

    const rows = await service.preferences(1, 'member')
    const pm = rows.find((row) => row.kind === 'pm.received')

    expect(pm?.email).toBe(true)
    expect(pm?.push).toBe(false)
  })

  it('forgets a browser that unsubscribes', async () => {
    await service.subscribeToPush(DEVICE)
    expect(await service.countPushSubscriptions(1)).toBe(1)

    expect(await service.unsubscribeFromPush(1, DEVICE.endpoint)).toBe(true)
    expect(await service.countPushSubscriptions(1)).toBe(0)
  })
})
