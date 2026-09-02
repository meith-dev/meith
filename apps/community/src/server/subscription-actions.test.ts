import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import { combinePermissionSets, InMemoryAuthorizationSource } from '@meith/authorization'
import type * as CoreModule from '@meith/core'
import type {
  SubscriptionMode,
  SubscriptionRepository,
  SubscriptionTarget,
} from '@meith/subscriptions'
import { mintUnsubscribeToken } from '@meith/subscriptions'

const { SECRET, RedirectError } = vi.hoisted(() => {
  const SECRET = 'test-auth-secret-test-auth-secret'
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { SECRET, RedirectError }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

vi.mock('@meith/core', async () => {
  const actual = await vi.importActual<typeof CoreModule>('@meith/core')
  return { ...actual, env: { ...actual.env, AUTH_SECRET: SECRET, DATA_SOURCE: 'fixture' } }
})

const { subscribeAction, unsubscribeAction, unsubscribeByTokenAction } = await import(
  './subscription-actions'
)
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')
const { PROGRESSIVE_FIELD } = await import('@/view/progressive-enhancement')

class FakeSubscriptions implements SubscriptionRepository {
  readonly subscribed: Array<{ userId: number; target: string; targetId: number; mode: string }> =
    []
  readonly removed: Array<{ userId: number; target: string; targetId: number }> = []

  async subscribe(input: {
    userId: number
    target: SubscriptionTarget
    targetId: number
    mode: SubscriptionMode
  }) {
    this.subscribed.push(input)
    return true
  }

  async unsubscribe(input: { userId: number; target: SubscriptionTarget; targetId: number }) {
    this.removed.push(input)
    return true
  }

  async modeFor() {
    return null
  }
  async listFor() {
    return []
  }
  async usersWithPending() {
    return []
  }
  async pendingFor() {
    return { userId: 0, posts: [], watermarks: [] }
  }
  async advanceWatermarks() {}
  async recordDigestRun() {}
}

class FakeNotifications {
  readonly saved: Array<{ userId: number; entries: Map<string, boolean> }> = []

  async savePreferences(userId: number, _channel: string, entries: ReadonlyMap<string, boolean>) {
    this.saved.push({ userId, entries: new Map(entries) })
  }
}

class FakeMemberSettings {
  readonly consent: Array<{ userId: number; optIn: boolean }> = []

  async saveMassMailOptIn(input: { userId: number; optIn: boolean }) {
    this.consent.push(input)
  }
}

let subscriptions: FakeSubscriptions
let notifications: FakeNotifications
let memberSettings: FakeMemberSettings

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

function install(forumId: number | null = SEED_FORUM.general, hidden = false) {
  installTestContainer({
    overrides: hidden
      ? [
          {
            forumId: SEED_FORUM.general,
            groupId: SEED_GROUP.registered,
            overrides: { canView: false, canViewThreads: false },
          },
        ]
      : [],
    container: {
      subscriptions,
      notifications,
      memberSettings,
      threads: {
        locate: async () => (forumId === null ? null : { forumId, authorUserId: null }),
        findById: async () => ({
          id: forumId ?? 0,
          type: 'forum',
          title: 'A forum',
          slug: 'a-forum',
        }),
        listForum: async () => ({ rows: [], nextCursor: null }),
      },
      forums: {
        listAll: async () => [],
        listListing: async () => [],
        findById: async () => ({
          id: forumId ?? 0,
          type: 'forum',
          title: 'A forum',
          slug: 'a-forum',
        }),
      },
    },
  })
}

beforeEach(async () => {
  subscriptions = new FakeSubscriptions()
  notifications = new FakeNotifications()
  memberSettings = new FakeMemberSettings()
  actorRef.current = await actorFor(SEED_GROUP.registered, 7)
  install()
})

describe('following', () => {
  it('subscribes to a thread the member may read', async () => {
    const result = await run(
      subscribeAction,
      form([
        ['target', 'thread'],
        ['targetId', '20'],
        ['mode', 'daily'],
        ['back', '/thread/20-a-thread'],
      ]),
    )

    expect(result.redirectedTo).toBe('/thread/20-a-thread')
    expect(subscriptions.subscribed[0]).toMatchObject({
      userId: 7,
      target: 'thread',
      targetId: 20,
      mode: 'daily',
    })
  })

  it('refuses a thread whose forum this actor cannot see', async () => {
    install(SEED_FORUM.general, true)

    const result = await run(
      subscribeAction,
      form([
        ['target', 'thread'],
        ['targetId', '20'],
        ['mode', 'instant'],
      ]),
    )

    expect(result.error).toBe('That does not exist.')
    expect(subscriptions.subscribed).toEqual([])
  })

  it('gives the same answer for a thread that does not exist', async () => {
    install(null)

    const result = await run(
      subscribeAction,
      form([
        ['target', 'thread'],
        ['targetId', '999'],
        ['mode', 'instant'],
      ]),
    )

    expect(result.error).toBe('That does not exist.')
  })

  it('rejects a cadence that is not one', async () => {
    const result = await run(
      subscribeAction,
      form([
        ['target', 'thread'],
        ['targetId', '20'],
        ['mode', 'hourly'],
      ]),
    )

    expect(result.error).toBe('That is not a notification setting.')
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const result = await run(
      subscribeAction,
      form([
        ['target', 'thread'],
        ['targetId', '20'],
        ['mode', 'instant'],
      ]),
    )

    expect(result.error).toContain('logged in')
  })

  it('takes the member from the session, never from the form', async () => {
    await run(
      subscribeAction,
      form([
        ['target', 'thread'],
        ['targetId', '20'],
        ['mode', 'instant'],
        ['userId', '1'],
      ]),
    )

    expect(subscriptions.subscribed[0]?.userId).toBe(7)
  })

  it('never redirects off the board', async () => {
    const result = await run(
      subscribeAction,
      form([
        ['target', 'thread'],
        ['targetId', '20'],
        ['mode', 'instant'],
        ['back', '//evil.example/phish'],
      ]),
    )

    expect(result.redirectedTo).toBe('/subscriptions?followed=1')
  })

  it('reports the new state instead of redirecting when the submit is enhanced', async () => {
    const state = await subscribeAction(
      EMPTY_STATE,
      form([
        ['target', 'thread'],
        ['targetId', '20'],
        ['mode', 'instant'],
        [PROGRESSIVE_FIELD, '1'],
      ]),
    )

    expect(state).toEqual({ subscribed: true })
  })
})

describe('unfollowing', () => {
  it('stops a subscription without asking whether the member may still read it', async () => {
    install(SEED_FORUM.general, true)

    const result = await run(
      unsubscribeAction,
      form([
        ['target', 'forum'],
        ['targetId', '3'],
      ]),
    )

    expect(result.redirectedTo).toBe('/subscriptions?stopped=1')
    expect(subscriptions.removed).toEqual([{ userId: 7, target: 'forum', targetId: 3 }])
  })

  it('reports the new state instead of redirecting when the submit is enhanced', async () => {
    install(SEED_FORUM.general, true)

    const state = await unsubscribeAction(
      EMPTY_STATE,
      form([
        ['target', 'forum'],
        ['targetId', '3'],
        [PROGRESSIVE_FIELD, '1'],
      ]),
    )

    expect(state).toEqual({ subscribed: false })
  })
})

describe('the no-login unsubscribe', () => {
  beforeEach(() => {
    actorRef.current = null
  })

  it('acts on a valid token with nobody signed in', async () => {
    const token = mintUnsubscribeToken({ userId: 42, scope: 'thread', targetId: 20 }, SECRET)

    const result = await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(result.redirectedTo).toBe('/unsubscribe?done=one')
    expect(subscriptions.removed).toEqual([{ userId: 42, target: 'thread', targetId: 20 }])
  })

  it('switches subscription e-mail off for the board-wide scope', async () => {
    const token = mintUnsubscribeToken({ userId: 42, scope: 'email', targetId: 0 }, SECRET)

    const result = await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(result.redirectedTo).toBe('/unsubscribe?done=email')
    expect(subscriptions.removed).toEqual([])
    expect(notifications.saved[0]?.entries.get('subscription.digest')).toBe(false)
    expect(notifications.saved[0]?.entries.get('subscription.reply')).toBe(false)
  })

  it('switches only the board digest off for the board-digest scope', async () => {
    const token = mintUnsubscribeToken({ userId: 42, scope: 'board-digest', targetId: 0 }, SECRET)

    const result = await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(result.redirectedTo).toBe('/unsubscribe?done=boardDigest')
    expect(subscriptions.removed).toEqual([])
    expect(notifications.saved).toEqual([
      { userId: 42, entries: new Map([['board.digest', false]]) },
    ])
  })

  it('leaves subscription e-mail alone when only the board digest is switched off', async () => {
    const token = mintUnsubscribeToken({ userId: 42, scope: 'board-digest', targetId: 0 }, SECRET)

    await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(notifications.saved[0]?.entries.has('subscription.digest')).toBe(false)
    expect(notifications.saved[0]?.entries.has('subscription.reply')).toBe(false)
  })

  it('stops the board’s announcements for the announcements scope', async () => {
    const token = mintUnsubscribeToken({ userId: 42, scope: 'mass-mail', targetId: 0 }, SECRET)

    const result = await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(result.redirectedTo).toBe('/unsubscribe?done=announcements')
    expect(memberSettings.consent).toEqual([{ userId: 42, optIn: false }])
    expect(subscriptions.removed).toEqual([])
    expect(notifications.saved).toEqual([])
  })

  it('leaves the announcements alone when the token is about a thread', async () => {
    const token = mintUnsubscribeToken({ userId: 42, scope: 'thread', targetId: 20 }, SECRET)

    await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(memberSettings.consent).toEqual([])
  })

  it('refuses a forged token', async () => {
    const token = mintUnsubscribeToken(
      { userId: 42, scope: 'thread', targetId: 20 },
      'a-different-secret-a-different-se',
    )

    const result = await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(result.error).toBe('That unsubscribe link is not valid.')
    expect(subscriptions.removed).toEqual([])
  })

  it('refuses a token edited to name another member', async () => {
    const token = mintUnsubscribeToken(
      { userId: 42, scope: 'thread', targetId: 20 },
      SECRET,
    ).replace('.42.', '.43.')

    const result = await run(unsubscribeByTokenAction, form([['token', token]]))

    expect(result.error).toBe('That unsubscribe link is not valid.')
    expect(subscriptions.removed).toEqual([])
  })

  it('refuses an empty token with the same message', async () => {
    const result = await run(unsubscribeByTokenAction, form([['token', '']]))
    expect(result.error).toBe('That unsubscribe link is not valid.')
  })
})
