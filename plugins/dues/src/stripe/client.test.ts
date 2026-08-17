import { describe, expect, it } from 'vitest'

import {
  createStripeClient,
  encodeStripeForm,
  StripeError,
  sessionFromApi,
  subscriptionFromApi,
} from './client'

describe('encodeStripeForm', () => {
  it('encodes nesting in bracket notation and arrays by index', () => {
    const encoded = encodeStripeForm({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: 500 } }],
      metadata: { dues_order_id: '42' },
    })

    expect(decodeURIComponent(encoded).split('&')).toEqual([
      'mode=payment',
      'line_items[0][quantity]=1',
      'line_items[0][price_data][currency]=gbp',
      'line_items[0][price_data][unit_amount]=500',
      'metadata[dues_order_id]=42',
    ])
  })

  it('drops null and undefined, escapes what needs escaping', () => {
    expect(encodeStripeForm({ a: null, b: undefined, c: 'x&y=z' })).toBe('c=x%26y%3Dz')
  })
})

function fetchScript(responses: Array<{ status: number; body: unknown }>): {
  fetchImpl: typeof fetch
  calls: Array<{ url: string; init: RequestInit }>
} {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

function client(script: ReturnType<typeof fetchScript>) {
  return createStripeClient({
    secretKey: 'sk_test_123',
    apiVersion: '2024-12-18.acacia',
    fetchImpl: script.fetchImpl,
    backoff: async () => {},
  })
}

describe('the request shape', () => {
  it('sends the bearer key, the pinned version, and an idempotency key on session creation', async () => {
    const script = fetchScript([{ status: 200, body: { id: 'cs_1', url: 'https://x' } }])

    await client(script).createCheckoutSession({ client_reference_id: '42', mode: 'payment' })

    const headers = script.calls[0]!.init.headers as Record<string, string>
    expect(script.calls[0]!.url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(headers.authorization).toBe('Bearer sk_test_123')
    expect(headers['stripe-version']).toBe('2024-12-18.acacia')
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(headers['idempotency-key']).toBe('dues-session-42')
  })

  it('honours an alternative API base for a test double', async () => {
    const script = fetchScript([{ status: 200, body: { id: 'cus_1' } }])
    const local = createStripeClient({
      secretKey: 'sk_test_123',
      apiVersion: 'v',
      apiBase: 'http://127.0.0.1:12111/',
      fetchImpl: script.fetchImpl,
      backoff: async () => {},
    })

    await local.createCustomer({ metadata: {} })
    expect(script.calls[0]!.url).toBe('http://127.0.0.1:12111/v1/customers')
  })
})

describe('failure and retry', () => {
  it('retries a 429 and a 500, then succeeds', async () => {
    const script = fetchScript([
      { status: 429, body: { error: { message: 'slow down' } } },
      { status: 500, body: { error: { message: 'oops' } } },
      { status: 200, body: { id: 'cus_1' } },
    ])

    const customer = await client(script).createCustomer({ metadata: {} })
    expect(customer.id).toBe('cus_1')
    expect(script.calls).toHaveLength(3)
  })

  it('a 402 is an answer, not a fault: no retry, typed error', async () => {
    const script = fetchScript([
      {
        status: 402,
        body: {
          error: { message: 'Your card was declined.', code: 'card_declined', type: 'card_error' },
        },
      },
    ])

    const failure = await client(script)
      .createCustomer({ metadata: {} })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(StripeError)
    expect((failure as StripeError).code).toBe('card_declined')
    expect((failure as StripeError).transient).toBe(false)
    expect(script.calls).toHaveLength(1)
  })

  it('gives up after the attempt budget with the last error', async () => {
    const script = fetchScript([{ status: 503, body: {} }])

    const failure = await client(script)
      .createCustomer({ metadata: {} })
      .catch((error: unknown) => error)

    expect((failure as StripeError).status).toBe(503)
    expect(script.calls).toHaveLength(3)
  })
})

describe('response parsing across API versions', () => {
  it('reads a checkout session, expanded or id-only', () => {
    const session = sessionFromApi({
      id: 'cs_1',
      url: null,
      status: 'complete',
      payment_status: 'paid',
      amount_total: 1200,
      currency: 'gbp',
      subscription: { id: 'sub_9' },
      payment_intent: 'pi_7',
      customer: 'cus_3',
    })

    expect(session).toMatchObject({
      status: 'complete',
      paymentStatus: 'paid',
      amountTotal: 1200,
      subscriptionId: 'sub_9',
      paymentIntentId: 'pi_7',
    })
  })

  it('reads current_period_end from the subscription (acacia) or its items (basil)', () => {
    const acacia = subscriptionFromApi({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1_760_000_000,
    })
    expect(acacia.currentPeriodEnd).toEqual(new Date(1_760_000_000 * 1000))

    const basil = subscriptionFromApi({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: true,
      items: {
        data: [{ current_period_end: 1_760_000_000 }, { current_period_end: 1_760_100_000 }],
      },
    })
    expect(basil.currentPeriodEnd).toEqual(new Date(1_760_100_000 * 1000))
    expect(basil.cancelAtPeriodEnd).toBe(true)

    const bare = subscriptionFromApi({ id: 'sub_1', status: 'canceled' })
    expect(bare.currentPeriodEnd).toBeNull()
  })
})
