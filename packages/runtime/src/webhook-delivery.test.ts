/**
 * F81 — the delivery loop's verdicts.
 *
 * `verdictFor`, `signPayload` and the backoff are tested in `@meith/api`. What
 * is only testable here is the loop around them: that the body signed is the
 * body sent, that a transport failure with no status code is still scheduled
 * rather than lost, and that each verdict reaches the right store method.
 *
 * `fetch` is injected, so nothing here opens a socket.
 */
import { describe, expect, it, vi } from 'vitest'

import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from '@meith/api'

import { deliverWebhooks, type ClaimedDelivery, type WebhookDeliveryStore } from './webhook-delivery'

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
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const { impl } = store([claimed()])

    await deliverWebhooks(impl, 10, { now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://subscriber.test/hook')

    const headers = init.headers as Record<string, string>
    const body = init.body as string

    /*
     * The property the published documentation asks third parties to implement.
     * Verifying with the *sent* body rather than a re-serialised copy is the
     * point: a loop that signed `JSON.stringify(payload)` twice could drift and
     * this assertion would not notice.
     */
    expect(
      verifySignature(
        'shhh-a-long-enough-secret',
        Number(headers[TIMESTAMP_HEADER]),
        body,
        headers[SIGNATURE_HEADER]!,
        Math.floor(NOW.getTime() / 1000),
      ),
    ).toBe(true)
  })

  it('never follows a redirect', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const { impl } = store([claimed()])

    await deliverWebhooks(impl, 10, { now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    /* A 3xx would otherwise deliver the operator's signed payload to a host
       they never configured. */
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.redirect).toBe('manual')
  })

  it('counts any 2xx as delivered', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }))
    const { impl, calls } = store([claimed()])

    const result = await deliverWebhooks(impl, 10, {
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toMatchObject({ attempted: 1, delivered: 1, retried: 0, dead: 0 })
    expect(calls.delivered).toEqual([{ id: 1, status: 202, at: NOW }])
  })

  it('schedules a retry for a server error', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }))
    const { impl, calls } = store([claimed({ attempts: 1 })])

    const result = await deliverWebhooks(impl, 10, {
      now: NOW,
      random: () => 0.5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.retried).toBe(1)
    /* 30s base on the first failure, with the jitter pinned to its midpoint. */
    expect(calls.retried).toEqual([
      { id: 1, at: new Date(NOW.getTime() + 30_000), status: 500, error: 'HTTP 500' },
    ])
  })

  it('dead-letters a 410 immediately, however early the attempt', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 410 }))
    const { impl, calls } = store([claimed({ attempts: 1 })])

    const result = await deliverWebhooks(impl, 10, {
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.dead).toBe(1)
    expect(calls.retried).toEqual([])
    expect(calls.dead).toHaveLength(1)
  })

  it('retries a transport failure, which has no status code at all', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const { impl, calls } = store([claimed({ attempts: 1 })])

    const result = await deliverWebhooks(impl, 10, {
      now: NOW,
      random: () => 0.5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    /*
     * The case `verdictFor` cannot answer: there is no response to judge. A
     * loop that only handled status codes would drop these, and a subscriber
     * whose DNS was briefly wrong would silently lose every event.
     */
    expect(result.retried).toBe(1)
    expect(calls.retried[0]).toMatchObject({ status: null, error: 'ECONNREFUSED' })
  })

  it('dead-letters a transport failure once the attempts are exhausted', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const { impl, calls } = store([claimed({ attempts: 6 })])

    const result = await deliverWebhooks(impl, 10, {
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.dead).toBe(1)
    expect(calls.dead[0]).toMatchObject({ status: null, error: 'ECONNREFUSED' })
  })

  it('keeps going after one subscriber fails', async () => {
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call++
      if (call === 1) throw new Error('down')
      return new Response(null, { status: 200 })
    })
    const { impl, calls } = store([claimed({ id: 1 }), claimed({ id: 2 })])

    const result = await deliverWebhooks(impl, 10, {
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    /* One broken endpoint must not cost the batch — the second delivery is to
       a different subscriber that has done nothing wrong. */
    expect(result).toMatchObject({ attempted: 2, delivered: 1, retried: 1 })
    expect(calls.delivered).toHaveLength(1)
  })

  it('does nothing when nothing is due', async () => {
    const fetchImpl = vi.fn()
    const { impl } = store([])

    const result = await deliverWebhooks(impl, 10, {
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toEqual({ attempted: 0, delivered: 0, retried: 0, dead: 0 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
