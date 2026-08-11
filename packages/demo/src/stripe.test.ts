import { DUES_DEMO_PRICES } from '@meith/plugin-dues'
import { describe, expect, it } from 'vitest'

import { fakeStripe, type FakeStripeRequest, type FakeStripeResponse } from './stripe'

const BASE = 'https://demo.example/demo/stripe'

function stripe() {
  return fakeStripe({ publicBase: BASE, now: () => new Date('2026-08-10T09:00:00Z') })
}

function call(
  method: string,
  path: string,
  body: Record<string, string> = {},
  query: Record<string, string> = {},
): FakeStripeRequest {
  return {
    method,
    path,
    body: new URLSearchParams(body).toString(),
    query: new URLSearchParams(query),
  }
}

function json(response: FakeStripeResponse): Record<string, unknown> {
  if (response.kind !== 'json') throw new Error(`expected json, got ${response.kind}`)
  return response.body as Record<string, unknown>
}

const PASS = {
  mode: 'payment',
  'line_items[0][price_data][unit_amount]': '1200',
  'line_items[0][price_data][currency]': 'gbp',
  'line_items[0][price_data][product_data][name]': '90-day pass',
  success_url: 'https://demo.example/plugins/dues/return?order=7',
  cancel_url: 'https://demo.example/plugins/dues?cancelled=1',
}

describe('the fake Stripe', () => {
  it('opens a checkout session on a URL a browser can follow', () => {
    const fake = stripe()
    const session = json(fake.handle(call('POST', '/v1/checkout/sessions', PASS)).response)

    expect(session.payment_status).toBe('unpaid')
    expect(session.amount_total).toBe(1200)
    expect(session.url).toBe(`${BASE}/checkout/${String(session.id)}`)
  })

  it('prices a subscription from the manifest the shop was seeded from', () => {
    const fake = stripe()
    const session = json(
      fake.handle(
        call('POST', '/v1/checkout/sessions', {
          mode: 'subscription',
          'line_items[0][price]': DUES_DEMO_PRICES[0]!.id,
          success_url: 'https://demo.example/plugins/dues/return?order=8',
          cancel_url: 'https://demo.example/plugins/dues',
        }),
      ).response,
    )

    expect(session.amount_total).toBe(DUES_DEMO_PRICES[0]!.unitAmount)
    expect(session.currency).toBe(DUES_DEMO_PRICES[0]!.currency)

    const page = fake.handle(call('GET', `/checkout/${String(session.id)}`)).response
    if (page.kind !== 'html') throw new Error('expected the checkout page')
    expect(page.body).toContain(DUES_DEMO_PRICES[0]!.name)
    expect(page.body).toContain('per month')
  })

  it('says on the page that it is not Stripe, and charges no card', () => {
    const fake = stripe()
    const session = json(fake.handle(call('POST', '/v1/checkout/sessions', PASS)).response)
    const page = fake.handle(call('GET', `/checkout/${String(session.id)}`)).response

    expect(page.kind).toBe('html')
    if (page.kind !== 'html') return
    expect(page.body).toContain('Not Stripe')
    expect(page.body).toContain('£12.00')
    expect(page.body).not.toMatch(/card number/i)
  })

  it('pays, hands back an event to sign, and returns the buyer to the board', () => {
    const fake = stripe()
    const session = json(fake.handle(call('POST', '/v1/checkout/sessions', PASS)).response)
    const paid = fake.handle(call('POST', `/checkout/${String(session.id)}/pay`))

    expect(paid.response).toEqual({ kind: 'redirect', to: PASS.success_url })

    const event = paid.event as { type: string; data: { object: Record<string, unknown> } }
    expect(event.type).toBe('checkout.session.completed')
    expect(event.data.object.payment_status).toBe('paid')
    expect(event.data.object.amount_total).toBe(1200)
    expect(event.data.object.payment_intent).toMatch(/^pi_fake_/)
    expect(event.data.object.subscription).toBeNull()
  })

  it('mints a subscription id only for a subscription checkout', () => {
    const fake = stripe()
    const session = json(
      fake.handle(
        call('POST', '/v1/checkout/sessions', {
          mode: 'subscription',
          'line_items[0][price]': DUES_DEMO_PRICES[0]!.id,
          success_url: 'https://demo.example/plugins/dues/return?order=9',
          cancel_url: 'https://demo.example/plugins/dues',
        }),
      ).response,
    )
    const paid = fake.handle(call('POST', `/checkout/${String(session.id)}/pay`))
    const event = paid.event as { data: { object: Record<string, unknown> } }

    expect(event.data.object.subscription).toMatch(/^sub_fake_/)
    expect(event.data.object.payment_intent).toBeNull()
  })

  it('pays only once, however many times the button is pressed', () => {
    const fake = stripe()
    const session = json(fake.handle(call('POST', '/v1/checkout/sessions', PASS)).response)
    const first = fake.handle(call('POST', `/checkout/${String(session.id)}/pay`))
    const second = fake.handle(call('POST', `/checkout/${String(session.id)}/pay`))

    const one = first.event as { data: { object: { payment_intent: string } } }
    const two = second.event as { data: { object: { payment_intent: string } } }
    expect(two.data.object.payment_intent).toBe(one.data.object.payment_intent)
  })

  it('calls a session it has forgotten expired, so the reconcile task can close it', () => {
    const session = json(stripe().handle(call('GET', '/v1/checkout/sessions/cs_gone')).response)
    expect(session.status).toBe('expired')
  })

  it('remembers a cancellation asked for through the API', () => {
    const fake = stripe()
    const before = json(fake.handle(call('GET', '/v1/subscriptions/sub_demo_x')).response)
    expect(before.cancel_at_period_end).toBe(false)

    fake.handle(call('POST', '/v1/subscriptions/sub_demo_x', { cancel_at_period_end: 'true' }))
    const after = json(fake.handle(call('GET', '/v1/subscriptions/sub_demo_x')).response)
    expect(after.cancel_at_period_end).toBe(true)
  })

  it('answers for a seeded subscription it never saw created', () => {
    const fake = stripe()
    expect(json(fake.handle(call('GET', '/v1/subscriptions/sub_demo_lapsed')).response).status).toBe(
      'past_due',
    )
    expect(
      json(fake.handle(call('GET', '/v1/subscriptions/sub_demo_leaving')).response)
        .cancel_at_period_end,
    ).toBe(true)
  })

  it('sends the billing portal back where it was asked to', () => {
    const fake = stripe()
    const portal = json(
      fake.handle(
        call('POST', '/v1/billing_portal/sessions', {
          customer: 'cus_demo_1',
          return_url: 'https://demo.example/plugins/dues/manage',
        }),
      ).response,
    )

    const page = fake.handle(
      call('GET', '/portal', {}, { return: 'https://demo.example/plugins/dues/manage' }),
    ).response

    expect(String(portal.url)).toContain(`${BASE}/portal?return=`)
    expect(page.kind).toBe('html')
    if (page.kind === 'html') {
      expect(page.body).toContain('https://demo.example/plugins/dues/manage')
    }
  })

  it('mints the product and price an admin-made subscription plan needs', () => {
    const fake = stripe()
    const product = json(fake.handle(call('POST', '/v1/products', { name: 'Patron' })).response)
    const price = json(
      fake.handle(
        call('POST', '/v1/prices', {
          product: String(product.id),
          unit_amount: '2500',
          currency: 'gbp',
          'recurring[interval]': 'month',
        }),
      ).response,
    )

    const session = json(
      fake.handle(
        call('POST', '/v1/checkout/sessions', {
          mode: 'subscription',
          'line_items[0][price]': String(price.id),
          success_url: 'https://demo.example/plugins/dues/return?order=11',
          cancel_url: 'https://demo.example/plugins/dues',
        }),
      ).response,
    )
    expect(session.amount_total).toBe(2500)

    const page = fake.handle(call('GET', `/checkout/${String(session.id)}`)).response
    if (page.kind !== 'html') throw new Error('expected the checkout page')
    expect(page.body).toContain('Patron')
  })

  it('has no fake for an endpoint the plugin never calls', () => {
    const response = stripe().handle(call('POST', '/v1/payouts'))
    expect(response.response).toMatchObject({ status: 404 })
  })
})
