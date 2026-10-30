import { beforeEach, describe, expect, it, vi } from 'vitest'

const observations: Array<{ value: number; labels: Record<string, string> | undefined }> = []
const quota = vi.hoisted(() => ({
  authenticated: false,
  consume: vi.fn(async (_store: unknown, _userId: number, _cost: number, _now: Date) => ({
    allowed: true,
  })),
}))

vi.mock('@meith/api', () => ({
  bearerFrom: (header: string | null) => header?.replace('Bearer ', '') ?? null,
  consumeAnonymousRateLimit: async () => ({ allowed: true }),
  consumeRateLimit: quota.consume,
  hasScope: () => true,
  matchRoute: () =>
    quota.authenticated
      ? { route: { method: 'GET', path: '/forums', scope: 'forums:read', cost: 1 }, params: {} }
      : null,
  rateLimitHeaders: () => ({}),
  routeKey: (route: unknown) => JSON.stringify(route),
}))

vi.mock('@meith/authorization', () => ({}))

vi.mock('@meith/core', () => ({
  isAppError: () => false,
  metrics: {
    histogram: () => ({
      observe: (value: number, labels?: Record<string, string>) => {
        observations.push({ value, labels })
      },
    }),
  },
  statusForError: () => 500,
  toPublicError: () => ({ error: { code: 'internal', message: 'failed' } }),
  withSpan: async (
    _name: string,
    _attributes: Record<string, unknown>,
    fn: (span: { setAttribute: () => void }) => Promise<unknown>,
  ) => fn({ setAttribute: () => {} }),
}))

vi.mock('@meith/core/logger', () => ({
  currentRequestId: () => 'req-1',
}))

vi.mock('@/server/api/http', () => ({ JSON_MEDIA_TYPE: 'application/json' }))
vi.mock('@/server/api/registry', () => ({ handlerFor: () => null }))
vi.mock('@/server/api-auth', () => ({
  anonymousLimits: () => null,
  anonymousSubject: async () => 'anon',
  apiActor: async () => null,
  apiGuest: async () => ({ id: 0, kind: 'guest' }),
  apiToken: async (presented: string) => ({
    token: { id: presented === 'first' ? 101 : 102, userId: 7 },
    limits: {},
  }),
}))
vi.mock('@/server/board-offline', () => ({ boardOffline: async () => null }))
vi.mock('@/server/i18n', () => ({ getMessageResolver: async () => ({}) }))

const { GET } = await import('../../app/api/v1/[...path]/route')

beforeEach(() => {
  observations.length = 0
  quota.authenticated = false
  quota.consume.mockClear()
})

describe('the v1 API request wrapper', () => {
  it('charges both tokens belonging to an account to the same owner quota', async () => {
    quota.authenticated = true
    for (const token of ['first', 'second']) {
      await GET(
        new Request('https://board.example/api/v1/forums', {
          headers: { authorization: `Bearer ${token}` },
        }) as unknown as Parameters<typeof GET>[0],
      )
    }
    expect(quota.consume.mock.calls.map((call) => call[1])).toEqual([7, 7])
  })

  it('records a request-duration observation for a route nothing matches', async () => {
    const response = await GET(
      new Request('https://board.example/api/v1/no-such-thing') as unknown as Parameters<
        typeof GET
      >[0],
    )

    expect(response.status).toBe(404)
    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      labels: { method: 'GET', route: 'unmatched', status: '404' },
    })
  })
})
