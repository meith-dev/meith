import { beforeEach, describe, expect, it } from 'vitest'

import { NotificationService, MAX_STAFF_FANOUT } from './service'
import type {
  DeliverableNotification,
  NotificationRecord,
  NotificationRepository,
  RaiseInput,
  RaiseResult,
} from './types'

class MemoryNotifications implements NotificationRepository {
  readonly raised: RaiseInput[] = []
  readonly rows: NotificationRecord[] = []
  readonly preferences = new Map<number, Map<string, boolean>>()
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
      return { notificationId: existing, coalesced: true, emailQueued: false }
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
    return { notificationId: id, coalesced: false, emailQueued: input.email }
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

  async emailPreferencesFor(userId: number): Promise<ReadonlyMap<string, boolean>> {
    return this.preferences.get(userId) ?? new Map()
  }

  async saveEmailPreferences(userId: number, entries: ReadonlyMap<string, boolean>) {
    this.preferences.set(userId, new Map(entries))
  }

  async findForDelivery(): Promise<DeliverableNotification | null> {
    return null
  }

  async markEmailSent(): Promise<void> {}

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
    repo.preferences.set(1, new Map([['warning.received', false]]))

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

    repo.preferences.set(7, new Map([['plugin.dues.gift_received', false]]))
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
    await expect(
      service.raise({ userId: 7, kind: 'plugin.dues.other', data: {} }),
    ).rejects.toThrow(/Unknown notification kind/)
  })

  it('lists the registered kind on the member preferences screen and saves its toggle', async () => {
    const repo = new MemoryNotifications()
    const service = new NotificationService({ notifications: repo, extraKinds: [PLUGIN_KIND] })

    const prefs = await service.preferences(7, 'member')
    expect(prefs.some((row) => row.kind === 'plugin.dues.gift_received')).toBe(true)

    await service.savePreferences(7, 'member', [])
    expect(repo.preferences.get(7)?.get('plugin.dues.gift_received')).toBe(false)
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
      ['post.mentioned', true, true],
      ['post.quoted', false, true],
      ['pm.received', true, true],
      ['pm.receipt', false, true],
    ])
  })

  it('shows a stored override and marks it as not a default', async () => {
    repo.preferences.set(1, new Map([['warning.received', false]]))

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
    expect(stored?.get('warning.received')).toBe(false)
    expect(stored?.get('report.actioned')).toBe(true)
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
