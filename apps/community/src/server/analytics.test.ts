import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GOOGLE_ENDPOINT } from '@meith/analytics'
import { SettingsSnapshot } from '@meith/settings'

const requestHeaders = new Map<string, string>()
const cookieJar = new Map<string, string>()
const overrides = new Map<string, string>()
const recorded: Array<Record<string, unknown>> = []
const deferred: Array<() => Promise<void> | void> = []

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => requestHeaders.get(name) ?? null }),
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    },
  }),
}))

vi.mock('next/server', () => ({
  after: (task: () => Promise<void> | void) => {
    deferred.push(task)
  },
}))

vi.mock('./settings', () => ({
  getSettings: async () => SettingsSnapshot.fromOverrides(new Map(overrides)),
}))

vi.mock('./board-url', () => ({ boardUrl: async () => 'https://forum.example' }))

vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresAnalyticsRepository: class {
    async record(view: Record<string, unknown>) {
      recorded.push(view)
    }
  },
}))

const { recordPageView } = await import('./analytics')

const GUEST_COOKIE = '__Host-fs_guest'

function counting(on = true): void {
  overrides.set('analytics.enabled', on ? '1' : '0')
}

function connector(): void {
  overrides.set('analytics.google_enabled', '1')
  overrides.set('analytics.google_measurement_id', 'G-ABCD1234')
  overrides.set('analytics.google_api_secret', 'a-secret')
}

async function runDeferred(): Promise<void> {
  const tasks = [...deferred]
  deferred.length = 0
  for (const task of tasks) await task()
}

beforeEach(() => {
  requestHeaders.clear()
  cookieJar.clear()
  overrides.clear()
  recorded.length = 0
  deferred.length = 0

  requestHeaders.set('x-forum-path', '/thread/91-why-meitheal')
  cookieJar.set(GUEST_COOKIE, 'guest-token')

  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
})

describe('recordPageView', () => {
  it('counts nothing on a board that has not been asked to', async () => {
    await recordPageView(null)

    expect(recorded).toEqual([])
    expect(deferred).toEqual([])
  })

  it('records the bucketed path, not the address of the thread', async () => {
    counting()

    await recordPageView(null)

    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.path).toBe('/thread/:id')
    expect(recorded[0]?.member).toBe(false)
    expect(recorded[0]?.source).toBe('direct')
  })

  it('keeps no trace of the cookie it counted', async () => {
    counting()

    await recordPageView(null)

    expect(String(recorded[0]?.visitor)).not.toContain('guest-token')
    expect(String(recorded[0]?.visitor)).toHaveLength(32)
  })

  it('counts a signed-in reader as a member', async () => {
    counting()

    await recordPageView(42)

    expect(recorded[0]?.member).toBe(true)
  })

  it('counts nothing for a client that keeps no cookie', async () => {
    counting()
    requestHeaders.set('x-forum-fresh-guest', '1')
    cookieJar.clear()

    await recordPageView(null)

    expect(recorded).toEqual([])
  })

  it('counts nothing for a page that is not part of the public board', async () => {
    counting()
    requestHeaders.set('x-forum-path', '/usercp/security')

    await recordPageView(null)

    expect(recorded).toEqual([])
  })

  it('names an outside referrer and separates a link on the board itself', async () => {
    counting()
    requestHeaders.set('referer', 'https://news.example/story')
    await recordPageView(null)

    requestHeaders.set('referer', 'https://forum.example/12-general')
    await recordPageView(null)

    expect(recorded.map((view) => view.source)).toEqual(['news.example', 'internal'])
  })

  it('sends nothing to Google while the connector is off', async () => {
    counting()

    await recordPageView(null)
    await runDeferred()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends nothing to Google until the connector has both halves', async () => {
    counting()
    overrides.set('analytics.google_enabled', '1')
    overrides.set('analytics.google_measurement_id', 'G-ABCD1234')

    await recordPageView(null)
    await runDeferred()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the page view from the server once the connector is ready', async () => {
    counting()
    connector()

    await recordPageView(null)
    expect(fetch).not.toHaveBeenCalled()

    await runDeferred()

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(options.body)) as {
      client_id: string
      events: { name: string; params: Record<string, unknown> }[]
    }

    expect(url.startsWith(GOOGLE_ENDPOINT)).toBe(true)
    expect(url).toContain('measurement_id=G-ABCD1234')
    expect(body.events[0]?.name).toBe('page_view')
    expect(body.events[0]?.params.page_location).toBe(
      'https://forum.example/thread/91-why-meitheal',
    )
    expect(JSON.stringify(body)).not.toContain('guest-token')
  })

  it('mirrors to Google even when this board keeps no counts of its own', async () => {
    counting(false)
    connector()

    await recordPageView(null)
    await runDeferred()

    expect(recorded).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('survives a connector that cannot be reached', async () => {
    counting()
    connector()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network is down')
      }),
    )

    await recordPageView(null)
    await expect(runDeferred()).resolves.toBeUndefined()

    expect(recorded).toHaveLength(1)
  })
})
