import { describe, expect, it, vi } from 'vitest'

import { type PluginRuntimeContext, unavailablePluginRuntime } from '@meith/plugin-kit'

import { MAX_ATTEMPTS } from './delivery'
import { deliverBatch } from './run'

interface Row {
  id: number
  event: string
  body: string
  attempts: number
  settled: 'delivered' | 'dead' | null
  delaySeconds: number | null
  error: string | null
}

function fakeContext(rows: Row[], settings: Record<string, string>): PluginRuntimeContext {
  const data = {
    async query(text: string, params: readonly unknown[] = []) {
      if (text.includes('update plugin_webhooks_delivery\n       set attempts')) {
        const due = rows.filter((row) => row.settled === null).slice(0, Number(params[0]))
        for (const row of due) row.attempts += 1
        return due.map((row) => ({ ...row }))
      }
      const id = Number(params[0])
      const row = rows.find((candidate) => candidate.id === id)
      if (row === undefined) return []

      if (text.includes('delivered_at = now()')) row.settled = 'delivered'
      else if (text.includes('dead_at = now()')) {
        row.settled = 'dead'
        row.error = String(params[1])
      } else {
        row.delaySeconds = Number(params[1])
        row.error = String(params[2])
      }
      return []
    },
    async one() {
      return null
    },
    async tx<T>(work: (inner: unknown) => Promise<T>) {
      return work(data)
    },
  }

  return { ...unavailablePluginRuntime('a test'), settings, data } as PluginRuntimeContext
}

const CONFIGURED = {
  endpoint_url: 'https://hooks.example/abc',
  format: 'json',
  board_url: 'https://board.example',
  signing_secret: 'shh',
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    event: 'thread.created',
    body: '{"event":"thread.created"}',
    attempts: 0,
    settled: null,
    delaySeconds: null,
    error: null,
    ...overrides,
  }
}

const BODYLESS_STATUSES = new Set([204, 205, 304])

function responding(status: number, body = ''): typeof fetch {
  return vi.fn(
    async () => new Response(BODYLESS_STATUSES.has(status) ? null : body, { status }),
  ) as unknown as typeof fetch
}

describe('delivering a batch', () => {
  it('posts the queued body to the endpoint and marks it delivered', async () => {
    const rows = [row()]
    const fetchImpl = responding(204)

    const outcome = await deliverBatch(fakeContext(rows, CONFIGURED), { fetchImpl })

    expect(outcome).toEqual({ attempted: 1, delivered: 1, retried: 0, dead: 0 })
    expect(rows[0]?.settled).toBe('delivered')

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] as [string, RequestInit]
    expect(url).toBe('https://hooks.example/abc')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"event":"thread.created"}')
  })

  it('schedules a retry with a delay and keeps the reason', async () => {
    const rows = [row()]

    const outcome = await deliverBatch(fakeContext(rows, CONFIGURED), {
      fetchImpl: responding(503, 'busy'),
    })

    expect(outcome).toMatchObject({ retried: 1, delivered: 0, dead: 0 })
    expect(rows[0]?.settled).toBeNull()
    expect(rows[0]?.delaySeconds).toBeGreaterThan(0)
    expect(rows[0]?.error).toContain('HTTP 503')
  })

  it('gives up on a rejection no retry can fix', async () => {
    const rows = [row()]

    const outcome = await deliverBatch(fakeContext(rows, CONFIGURED), {
      fetchImpl: responding(404, 'no such hook'),
    })

    expect(outcome).toMatchObject({ dead: 1 })
    expect(rows[0]?.settled).toBe('dead')
    expect(rows[0]?.error).toContain('HTTP 404')
  })

  it('gives up once a row has spent its attempts', async () => {
    const rows = [row({ attempts: MAX_ATTEMPTS - 1 })]

    await deliverBatch(fakeContext(rows, CONFIGURED), { fetchImpl: responding(500) })

    expect(rows[0]?.settled).toBe('dead')
  })

  it('records a request that never got a response, rather than throwing', async () => {
    const rows = [row()]
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch

    const outcome = await deliverBatch(fakeContext(rows, CONFIGURED), { fetchImpl })

    expect(outcome).toMatchObject({ retried: 1 })
    expect(rows[0]?.error).toContain('no response')
  })

  it('does nothing at all, and touches no queue, while no endpoint is configured', async () => {
    const rows = [row()]
    const fetchImpl = responding(204)

    const outcome = await deliverBatch(fakeContext(rows, { endpoint_url: '' }), { fetchImpl })

    expect(outcome).toEqual({ attempted: 0, delivered: 0, retried: 0, dead: 0 })
    expect(rows[0]?.attempts).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a plain-http endpoint rather than sending the board’s content over it', async () => {
    const fetchImpl = responding(204)

    await deliverBatch(fakeContext([row()], { endpoint_url: 'http://hooks.example' }), {
      fetchImpl,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
