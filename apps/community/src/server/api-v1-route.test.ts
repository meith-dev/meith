import { beforeEach, describe, expect, it, vi } from 'vitest'

const observations: Array<{ value: number; labels: Record<string, string> | undefined }> = []

vi.mock('@meith/api', () => ({
  bearerFrom: () => null,
  consumeAnonymousRateLimit: async () => ({ allowed: true }),
  consumeRateLimit: async () => ({ allowed: true }),
  hasScope: () => true,
  matchRoute: () => null,
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
  apiToken: async () => null,
}))
vi.mock('@/server/board-offline', () => ({ boardOffline: async () => null }))
vi.mock('@/server/i18n', () => ({ getMessageResolver: async () => ({}) }))

const { GET } = await import('../../app/api/v1/[...path]/route')

beforeEach(() => {
  observations.length = 0
})

describe('the v1 API request wrapper', () => {
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
