import { beforeEach, describe, expect, it, vi } from 'vitest'

const handler = vi.fn(async (_request: { body: unknown }) => ({ status: 200, body: { ok: true } }))

vi.mock('@meith/api', () => ({
  bearerFrom: () => null,
  consumeAnonymousRateLimit: async () => ({ allowed: true }),
  consumeRateLimit: async () => ({ allowed: true }),
  hasScope: () => true,
  matchRoute: () => ({
    route: {
      method: 'POST',
      path: '/threads',
      scope: 'threads.write',
      cost: 1,
      request: {},
      authenticated: false,
    },
    params: {},
  }),
  rateLimitHeaders: () => ({}),
  routeKey: () => 'threads',
}))

vi.mock('@meith/authorization', () => ({}))

vi.mock('@meith/core', () => ({
  isAppError: () => false,
  metrics: { histogram: () => ({ observe: () => {} }) },
  statusForError: () => 500,
  toPublicError: () => ({ error: { code: 'internal', message: 'failed' } }),
  withSpan: async (
    _name: string,
    _attributes: Record<string, unknown>,
    fn: (span: { setAttribute: () => void }) => Promise<unknown>,
  ) => fn({ setAttribute: () => {} }),
}))

vi.mock('@meith/core/logger', () => ({ currentRequestId: () => 'req-1' }))

vi.mock('@/server/api/http', () => ({ JSON_MEDIA_TYPE: 'application/json' }))
vi.mock('@/server/api/registry', () => ({ handlerFor: () => handler }))
vi.mock('@/server/api-auth', () => ({
  anonymousLimits: () => null,
  anonymousSubject: async () => 'anon',
  apiActor: async () => null,
  apiGuest: async () => ({ id: 0, kind: 'guest' }),
  apiToken: async () => null,
}))
vi.mock('@/server/board-offline', () => ({ boardOffline: async () => null }))
vi.mock('@/server/i18n', () => ({ getMessageResolver: async () => ({}) }))

const { POST } = await import('../../app/api/v1/[...path]/route')

function post(body: BodyInit, headers: Record<string, string> = {}): Promise<Response> {
  const request = new Request('https://board.example/api/v1/threads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
  return POST(request as unknown as Parameters<typeof POST>[0])
}

beforeEach(() => {
  handler.mockClear()
})

describe('the v1 API body-size contract', () => {
  it('rejects a body over the limit with 413 and never invokes the handler', async () => {
    const response = await post('{"pad":"'.concat('a'.repeat(256 * 1024), '"}'))
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: { code: 'payload_too_large' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects a malformed body with 400', async () => {
    const response = await post('{ not json')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_body' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes a valid body to the handler', async () => {
    const response = await post('{"title":"Hello"}')
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0]).toMatchObject({ body: { title: 'Hello' } })
  })
})
