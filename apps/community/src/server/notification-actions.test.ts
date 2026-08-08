/**
 * F55 at the app layer.
 *
 * The service's judgements are unit-tested in `@meith/notifications` and the SQL
 * against real Postgres. What is proven here is the seam neither can see: that
 * every action is scoped to the signed-in member, and that the *audience* of a
 * preferences save comes from the actor rather than from the submitted form.
 *
 * That last one is the only thing on this screen anybody would try to abuse.
 * The preferences form is a list of checkbox values, and a member who posts
 * `email=system.task_failed` is asking to configure a staff kind — which must
 * write nothing at all rather than a row that quietly does nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryAuthorizationSource, combinePermissionSets } from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type {
  DeliverableNotification,
  NotificationRepository,
  RaiseInput,
  RaiseResult,
} from '@meith/notifications'

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { RedirectError }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

const {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  saveNotificationPreferencesAction,
} = await import('./notification-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

class FakeNotifications implements NotificationRepository {
  readonly markedRead: Array<{ userId: number; id: number }> = []
  readonly markedAll: number[] = []
  readonly saved: Array<{ userId: number; entries: Map<string, boolean> }> = []

  async raise(input: RaiseInput): Promise<RaiseResult> {
    return { notificationId: 1, coalesced: false, emailQueued: input.email }
  }

  async listFor() {
    return { rows: [] }
  }

  async unreadCount(): Promise<number> {
    return 0
  }

  async markRead(userId: number, id: number): Promise<boolean> {
    this.markedRead.push({ userId, id })
    return true
  }

  async markAllRead(userId: number): Promise<number> {
    this.markedAll.push(userId)
    return 1
  }

  async emailPreferencesFor(): Promise<ReadonlyMap<string, boolean>> {
    return new Map()
  }

  async saveEmailPreferences(userId: number, entries: ReadonlyMap<string, boolean>) {
    this.saved.push({ userId, entries: new Map(entries) })
  }

  async findForDelivery(): Promise<DeliverableNotification | null> {
    return null
  }

  async markEmailSent(): Promise<void> {}

  async administratorIds(): Promise<readonly number[]> {
    return []
  }
}

let notifications: FakeNotifications

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

async function run(
  action: (prev: typeof EMPTY_STATE, form: FormData) => Promise<typeof EMPTY_STATE>,
  data: FormData,
): Promise<{ redirectedTo?: string; error?: string }> {
  try {
    const state = await action(EMPTY_STATE, data)
    return state.error === undefined ? {} : { error: state.error }
  } catch (err) {
    if (err instanceof RedirectError) return { redirectedTo: err.location }
    throw err
  }
}

beforeEach(async () => {
  notifications = new FakeNotifications()
  actorRef.current = await actorFor(SEED_GROUP.registered, 7)
  installTestContainer({ container: { notifications } })
})

describe('marking read', () => {
  it('marks the signed-in member’s own notification', async () => {
    const result = await run(markNotificationReadAction, form([['notificationId', '4']]))

    expect(result.redirectedTo).toBe('/notifications?read=one')
    expect(notifications.markedRead).toEqual([{ userId: 7, id: 4 }])
  })

  it('takes the user id from the session, never from the form', async () => {
    await run(
      markNotificationReadAction,
      form([
        ['notificationId', '4'],
        /* A submitted user id is simply not read. */
        ['userId', '1'],
      ]),
    )

    expect(notifications.markedRead[0]?.userId).toBe(7)
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const result = await run(markNotificationReadAction, form([['notificationId', '4']]))

    expect(result.error).toContain('logged in')
    expect(notifications.markedRead).toEqual([])
  })

  it('refuses a board with no notification store rather than pretending', async () => {
    installTestContainer({ container: { notifications: null } })

    const result = await run(markNotificationReadAction, form([['notificationId', '4']]))

    expect(result.error).toContain('sample data')
  })

  it('rejects an id that is not one', async () => {
    const result = await run(markNotificationReadAction, form([['notificationId', '-3']]))

    expect(result.error).toBe('That notification does not exist.')
    expect(notifications.markedRead).toEqual([])
  })

  it('marks everything for the signed-in member', async () => {
    const result = await run(markAllNotificationsReadAction, form([]))

    expect(result.redirectedTo).toBe('/notifications?read=all')
    expect(notifications.markedAll).toEqual([7])
  })
})

describe('saving preferences', () => {
  it('writes the checked kinds on and the absent ones off', async () => {
    await run(saveNotificationPreferencesAction, form([['email', 'report.actioned']]))

    const written = notifications.saved[0]?.entries
    expect(written?.get('report.actioned')).toBe(true)
    /* An unchecked box submits nothing, so "off" is reconstructed. */
    expect(written?.get('warning.received')).toBe(false)
  })

  it('ignores a staff kind submitted by a member', async () => {
    await run(
      saveNotificationPreferencesAction,
      form([
        ['email', 'warning.received'],
        ['email', 'system.task_failed'],
      ]),
    )

    const written = notifications.saved[0]?.entries
    expect(written?.has('system.task_failed')).toBe(false)
    expect(notifications.saved).toHaveLength(1)
  })

  it('lets an administrator configure the staff kinds', async () => {
    actorRef.current = await actorFor(SEED_GROUP.administrators, 9)

    await run(
      saveNotificationPreferencesAction,
      form([['email', 'system.task_failed']]),
    )

    /* Two saves: one per audience, each scoped to its own kind list. */
    const kinds = notifications.saved.flatMap((s) => [...s.entries.keys()])
    expect(kinds).toContain('system.task_failed')
    expect(kinds).toContain('warning.received')

    const staff = notifications.saved.find((s) => s.entries.has('system.task_failed'))
    expect(staff?.entries.get('system.task_failed')).toBe(true)
  })

  it('redirects back to the screen it came from', async () => {
    const result = await run(saveNotificationPreferencesAction, form([]))
    expect(result.redirectedTo).toBe('/notifications/preferences?saved=1')
  })
})
