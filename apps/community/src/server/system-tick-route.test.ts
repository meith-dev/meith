import { beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'tick-secret-tick-secret-tick-sec'
const CRON = 'cron-secret-cron-secret-cron-sec'

const envRef: { TICK_SECRET: string | undefined; CRON_SECRET: string | undefined } = {
  TICK_SECRET: SECRET,
  CRON_SECRET: undefined,
}
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
const outcomes: { current: unknown[] } = { current: [] }
vi.mock('@meith/tasks', () => ({
  tick: async () => {
    ran.push('tick')
    return outcomes.current
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
  envRef.CRON_SECRET = undefined
  schedulerRef.current = { repository: {}, tasks: [], onTaskFailure: () => {} }
  warnings.length = 0
  ran.length = 0
  outcomes.current = []
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

  it('runs unauthenticated when neither secret is configured, and says so', async () => {
    envRef.TICK_SECRET = undefined
    envRef.CRON_SECRET = undefined

    const response = await POST(request(URL_BASE))

    expect(response.status).toBe(200)
    expect(warnings.join('\n')).toMatch(/Neither TICK_SECRET nor CRON_SECRET is set/)
  })

  it('accepts the bearer token Vercel Cron sends, which is CRON_SECRET', async () => {
    envRef.TICK_SECRET = undefined
    envRef.CRON_SECRET = CRON

    const response = await POST(request(URL_BASE, { authorization: `Bearer ${CRON}` }))

    expect(response.status).toBe(200)
    expect(ran).toEqual(['tick'])
  })

  it('keeps accepting TICK_SECRET once CRON_SECRET is set alongside it', async () => {
    envRef.CRON_SECRET = CRON

    const response = await POST(request(URL_BASE, { authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(200)
    expect(ran).toEqual(['tick'])
  })

  it('accepts either secret when both are set, so a move between them needs no downtime', async () => {
    envRef.CRON_SECRET = CRON

    expect((await POST(request(URL_BASE, { authorization: `Bearer ${CRON}` }))).status).toBe(200)
    expect(ran).toEqual(['tick'])
  })

  it('still accepts the dedicated header once CRON_SECRET is set', async () => {
    envRef.CRON_SECRET = CRON

    const response = await POST(request(URL_BASE, { 'x-tick-secret': SECRET }))

    expect(response.status).toBe(200)
    expect(ran).toEqual(['tick'])
  })

  it('refuses a wrong secret even when CRON_SECRET is the only one set', async () => {
    envRef.TICK_SECRET = undefined
    envRef.CRON_SECRET = CRON

    const response = await POST(request(URL_BASE, { authorization: 'Bearer not-the-secret' }))

    expect(response.status).toBe(404)
    expect(ran).toEqual([])
  })

  it('treats CRON_SECRET alone as protection, so it never runs unauthenticated', async () => {
    envRef.TICK_SECRET = undefined
    envRef.CRON_SECRET = CRON

    const response = await POST(request(URL_BASE))

    expect(response.status).toBe(404)
    expect(warnings.join('\n')).not.toMatch(/unauthenticated/)
  })

  it('reports a failed task as ok:false on a 2xx, so a cron retry does not tight-loop it', async () => {
    outcomes.current = [
      { taskId: 'outbox.relay', status: 'ran', durationMs: 1 },
      { taskId: 'search.reindex', status: 'failed', durationMs: 2, error: 'boom' },
    ]

    const response = await POST(request(URL_BASE, { authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: false })
  })

  it('reports ok:true when every task the tick reached succeeded or was skipped', async () => {
    outcomes.current = [
      { taskId: 'outbox.relay', status: 'ran', durationMs: 1 },
      { taskId: 'stats.rollup', status: 'skipped', durationMs: 0 },
    ]

    const response = await POST(request(URL_BASE, { authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, registered: 0 })
  })

  it('reports that a board with no scheduler cannot tick', async () => {
    schedulerRef.current = null

    const response = await POST(request(URL_BASE, { authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(503)
    expect(ran).toEqual([])
  })
})
