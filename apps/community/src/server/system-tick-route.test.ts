import { beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'tick-secret-tick-secret-tick-sec'

const envRef: { TICK_SECRET: string | undefined } = { TICK_SECRET: SECRET }
const warnings: string[] = []

vi.mock('@meith/core', () => ({
  env: envRef,
  logger: () => ({
    warn: (message: string) => {
      warnings.push(message)
    },
  }),
  withRequestContext: async <T>(_context: unknown, body: () => Promise<T>) => body(),
}))

const ran: string[] = []
vi.mock('@meith/tasks', () => ({
  tick: async () => {
    ran.push('tick')
    return []
  },
}))

const schedulerRef: { current: unknown } = { current: null }
vi.mock('@/server/container', () => ({
  getContainer: () => ({ scheduler: schedulerRef.current }),
}))

const { GET, POST } = await import('../../app/api/system/tick/route')

const URL_BASE = 'https://board.example/api/system/tick'

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

beforeEach(() => {
  envRef.TICK_SECRET = SECRET
  schedulerRef.current = { repository: {}, tasks: [], onTaskFailure: () => {} }
  warnings.length = 0
  ran.length = 0
})

describe('the tick route', () => {
  it('runs the tick for a caller presenting the secret as a bearer token', async () => {
    const response = await POST(request(URL_BASE, { authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(200)
    expect(ran).toEqual(['tick'])
  })

  it('reads the bearer scheme case-insensitively', async () => {
    const response = await POST(request(URL_BASE, { authorization: `bearer ${SECRET}` }))

    expect(response.status).toBe(200)
  })

  it('accepts the dedicated header for callers that cannot set authorization', async () => {
    const response = await POST(request(URL_BASE, { 'x-tick-secret': SECRET }))

    expect(response.status).toBe(200)
    expect(ran).toEqual(['tick'])
  })

  it('answers GET the same way, so an existing cron keeps working', async () => {
    const response = await GET(request(URL_BASE, { authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(200)
    expect(ran).toEqual(['tick'])
  })

  it('does not read the secret from the query string', async () => {
    const response = await GET(request(`${URL_BASE}?secret=${SECRET}`))

    expect(response.status).toBe(404)
    expect(ran).toEqual([])
  })

  it('says in the log why a query-string caller was refused', async () => {
    await GET(request(`${URL_BASE}?secret=${SECRET}`))

    expect(warnings.join('\n')).toMatch(/query string/)
  })

  it('refuses a caller presenting nothing', async () => {
    const response = await POST(request(URL_BASE))

    expect(response.status).toBe(404)
    expect(ran).toEqual([])
  })

  it('refuses a caller presenting the wrong secret', async () => {
    const response = await POST(request(URL_BASE, { authorization: 'Bearer not-the-secret' }))

    expect(response.status).toBe(404)
    expect(ran).toEqual([])
  })

  it('refuses a secret of the wrong length without leaking that it differed', async () => {
    const response = await POST(request(URL_BASE, { 'x-tick-secret': `${SECRET}extra` }))

    expect(response.status).toBe(404)
  })

  it('runs unauthenticated when no secret is configured, and says so', async () => {
    envRef.TICK_SECRET = undefined

    const response = await POST(request(URL_BASE))

    expect(response.status).toBe(200)
    expect(warnings.join('\n')).toMatch(/TICK_SECRET is not set/)
  })

  it('reports that a board with no scheduler cannot tick', async () => {
    schedulerRef.current = null

    const response = await POST(request(URL_BASE, { authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(503)
    expect(ran).toEqual([])
  })
})
