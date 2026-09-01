import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { describe, expect, it, vi } from 'vitest'

import { EVENT_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from '@meith/api'
import { BlockedOutboundError } from '@meith/core/outbound'

import {
  type ClaimedDelivery,
  type DeliverAttemptFn,
  deliverWebhooks,
  type WebhookDeliveryStore,
} from './webhook-delivery'

const NOW = new Date('2026-03-01T12:00:00.000Z')

function claimed(overrides: Partial<ClaimedDelivery> = {}): ClaimedDelivery {
  return {
    id: 1,
    webhookId: 7,
    deliveryId: 'dlv_abc',
    topic: 'post.created',
    payload: { postId: 42 },
    attempts: 1,
    url: 'https://subscriber.test/hook',
    secret: 'shhh-a-long-enough-secret',
    ...overrides,
  }
}

function store(rows: readonly ClaimedDelivery[]) {
  const calls = {
    delivered: [] as unknown[],
    retried: [] as unknown[],
    dead: [] as unknown[],
  }
  const impl: WebhookDeliveryStore = {
    claimDue: async () => rows,
    markDelivered: async (id, status, at) => void calls.delivered.push({ id, status, at }),
    scheduleRetry: async (id, at, status, error) =>
      void calls.retried.push({ id, at, status, error }),
    markDead: async (id, status, error, at) => void calls.dead.push({ id, status, error, at }),
  }
  return { impl, calls }
}

describe('deliverWebhooks', () => {
  it('signs the exact bytes it sends, and a subscriber can verify them', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => ({ status: 200 }))
    const { impl } = store([claimed()])

    await deliverWebhooks(impl, 10, { now: NOW, deliver })

    const attempt = deliver.mock.calls[0]![0]
    expect(attempt.url).toBe('https://subscriber.test/hook')

    const headers = attempt.headers
    expect(
      verifySignature(
        'shhh-a-long-enough-secret',
        Number(headers[TIMESTAMP_HEADER]),
        attempt.body,
        headers[SIGNATURE_HEADER]!,
        Math.floor(NOW.getTime() / 1000),
      ),
    ).toBe(true)
  })

  it('counts any 2xx as delivered', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => ({ status: 202 }))
    const { impl, calls } = store([claimed()])

    const result = await deliverWebhooks(impl, 10, { now: NOW, deliver })

    expect(result).toMatchObject({ attempted: 1, delivered: 1, retried: 0, dead: 0 })
    expect(calls.delivered).toEqual([{ id: 1, status: 202, at: NOW }])
  })

  it('schedules a retry for a server error', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => ({ status: 500 }))
    const { impl, calls } = store([claimed({ attempts: 1 })])

    const result = await deliverWebhooks(impl, 10, { now: NOW, random: () => 0.5, deliver })

    expect(result.retried).toBe(1)
    expect(calls.retried).toEqual([
      { id: 1, at: new Date(NOW.getTime() + 30_000), status: 500, error: 'HTTP 500' },
    ])
  })

  it('dead-letters a 410 immediately, however early the attempt', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => ({ status: 410 }))
    const { impl, calls } = store([claimed({ attempts: 1 })])

    const result = await deliverWebhooks(impl, 10, { now: NOW, deliver })

    expect(result.dead).toBe(1)
    expect(calls.retried).toEqual([])
    expect(calls.dead).toHaveLength(1)
  })

  it('dead-letters a blocked destination immediately, without retrying', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => {
      throw new BlockedOutboundError('The destination points at a private or internal address.')
    })
    const { impl, calls } = store([claimed({ attempts: 1 })])

    const result = await deliverWebhooks(impl, 10, { now: NOW, deliver })

    expect(result).toMatchObject({ dead: 1, retried: 0 })
    expect(calls.retried).toEqual([])
    expect(calls.dead[0]).toMatchObject({ status: null })
    expect((calls.dead[0] as { error: string }).error).toMatch(/private or internal/)
  })

  it('retries a transport failure, which has no status code at all', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => {
      throw new Error('ECONNREFUSED')
    })
    const { impl, calls } = store([claimed({ attempts: 1 })])

    const result = await deliverWebhooks(impl, 10, { now: NOW, random: () => 0.5, deliver })

    expect(result.retried).toBe(1)
    expect(calls.retried[0]).toMatchObject({ status: null, error: 'ECONNREFUSED' })
  })

  it('dead-letters a transport failure once the attempts are exhausted', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => {
      throw new Error('ECONNREFUSED')
    })
    const { impl, calls } = store([claimed({ attempts: 6 })])

    const result = await deliverWebhooks(impl, 10, { now: NOW, deliver })

    expect(result.dead).toBe(1)
    expect(calls.dead[0]).toMatchObject({ status: null, error: 'ECONNREFUSED' })
  })

  it('keeps going after one subscriber fails', async () => {
    let call = 0
    const deliver = vi.fn<DeliverAttemptFn>(async () => {
      call++
      if (call === 1) throw new Error('down')
      return { status: 200 }
    })
    const { impl, calls } = store([claimed({ id: 1 }), claimed({ id: 2 })])

    const result = await deliverWebhooks(impl, 10, { now: NOW, deliver })

    expect(result).toMatchObject({ attempted: 2, delivered: 1, retried: 1 })
    expect(calls.delivered).toHaveLength(1)
  })

  it('does nothing when nothing is due', async () => {
    const deliver = vi.fn<DeliverAttemptFn>(async () => ({ status: 200 }))
    const { impl } = store([])

    const result = await deliverWebhooks(impl, 10, { now: NOW, deliver })

    expect(result).toEqual({ attempted: 0, delivered: 0, retried: 0, dead: 0 })
    expect(deliver).not.toHaveBeenCalled()
  })

  it('posts a signed body a real local listener can verify end to end', async () => {
    const received: Array<{ headers: Record<string, string | undefined>; body: string }> = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        received.push({ headers: req.headers as Record<string, string | undefined>, body })
        res.statusCode = 204
        res.end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    try {
      const { impl } = store([
        claimed({
          url: `http://127.0.0.1:${port}/hook`,
          payload: { event: 'post.created', postId: 42 },
        }),
      ])

      const result = await deliverWebhooks(impl, 10, { now: NOW })

      expect(result).toMatchObject({ attempted: 1, delivered: 1 })
      expect(received).toHaveLength(1)

      const { headers, body } = received[0]!
      expect(headers[EVENT_HEADER]).toBe('post.created')
      expect(body).toBe(JSON.stringify({ event: 'post.created', postId: 42 }))
      expect(
        verifySignature(
          'shhh-a-long-enough-secret',
          Number(headers[TIMESTAMP_HEADER]),
          body,
          headers[SIGNATURE_HEADER]!,
          Math.floor(NOW.getTime() / 1000),
        ),
      ).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
