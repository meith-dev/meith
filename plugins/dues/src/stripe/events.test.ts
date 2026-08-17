import { describe, expect, it } from 'vitest'

import { parseEventEnvelope, type StripeEventEnvelope, toInternalEvent } from './events'

function envelope(type: string, object: Record<string, unknown>): StripeEventEnvelope {
  return { id: 'evt_1', type, object }
}

describe('parseEventEnvelope', () => {
  it('reads the id, type and object, and refuses anything else', () => {
    expect(
      parseEventEnvelope({ id: 'evt_1', type: 'invoice.paid', data: { object: { id: 'in_1' } } }),
    ).toEqual({ id: 'evt_1', type: 'invoice.paid', object: { id: 'in_1' } })

    expect(parseEventEnvelope(null)).toBeNull()
    expect(parseEventEnvelope('text')).toBeNull()
    expect(parseEventEnvelope({ id: 'evt_1' })).toBeNull()
    expect(parseEventEnvelope({ id: 'evt_1', type: 'x', data: {} })).toBeNull()
  })
})

describe('checkout session events', () => {
  it('a completed, paid session settles', () => {
    const internal = toInternalEvent(
      envelope('checkout.session.completed', {
        id: 'cs_1',
        payment_status: 'paid',
        amount_total: 1200,
        currency: 'gbp',
        subscription: null,
        payment_intent: 'pi_1',
        customer: 'cus_1',
      }),
    )
    expect(internal).toEqual({
      kind: 'checkout-settled',
      sessionId: 'cs_1',
      paid: true,
      amountTotal: 1200,
      currency: 'gbp',
      subscriptionId: null,
      paymentIntentId: 'pi_1',
      customerId: 'cus_1',
    })
  })

  it('a completed session on a delayed method is not yet paid', () => {
    const internal = toInternalEvent(
      envelope('checkout.session.completed', { id: 'cs_1', payment_status: 'unpaid' }),
    )
    expect(internal).toMatchObject({ kind: 'checkout-settled', paid: false })
  })

  it('async success, failure and expiry map to their own events', () => {
    expect(
      toInternalEvent(
        envelope('checkout.session.async_payment_succeeded', {
          id: 'cs_1',
          payment_status: 'paid',
        }),
      ),
    ).toMatchObject({ kind: 'checkout-settled', paid: true })
    expect(
      toInternalEvent(envelope('checkout.session.async_payment_failed', { id: 'cs_1' })),
    ).toEqual({ kind: 'checkout-failed', sessionId: 'cs_1' })
    expect(toInternalEvent(envelope('checkout.session.expired', { id: 'cs_1' }))).toEqual({
      kind: 'checkout-expired',
      sessionId: 'cs_1',
    })
  })
})

describe('invoice events, across API shapes', () => {
  it('reads the subscription directly (acacia) or from parent (basil)', () => {
    const acacia = toInternalEvent(
      envelope('invoice.paid', {
        id: 'in_1',
        subscription: 'sub_1',
        amount_paid: 500,
        currency: 'gbp',
        billing_reason: 'subscription_cycle',
        lines: { data: [{ period: { end: 1_760_000_000 } }] },
      }),
    )
    expect(acacia).toMatchObject({
      kind: 'invoice-paid',
      subscriptionId: 'sub_1',
      amountPaid: 500,
      billingReason: 'subscription_cycle',
      periodEnd: new Date(1_760_000_000 * 1000),
    })

    const basil = toInternalEvent(
      envelope('invoice.paid', {
        id: 'in_1',
        parent: { subscription_details: { subscription: { id: 'sub_2' } } },
        amount_paid: 500,
        lines: { data: [{ period: { end: 1_700_000_000 } }, { period: { end: 1_760_000_000 } }] },
      }),
    )
    expect(basil).toMatchObject({
      kind: 'invoice-paid',
      subscriptionId: 'sub_2',
      periodEnd: new Date(1_760_000_000 * 1000),
    })
  })

  it('a failed invoice carries the subscription', () => {
    expect(
      toInternalEvent(envelope('invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' })),
    ).toEqual({ kind: 'invoice-failed', subscriptionId: 'sub_1' })
  })
})

describe('subscription events', () => {
  it('reads cancel_at_period_end and the period end from either shape', () => {
    const acacia = toInternalEvent(
      envelope('customer.subscription.updated', {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: 1_760_000_000,
      }),
    )
    expect(acacia).toMatchObject({
      kind: 'subscription-updated',
      cancelAtPeriodEnd: true,
      periodEnd: new Date(1_760_000_000 * 1000),
    })

    const basil = toInternalEvent(
      envelope('customer.subscription.updated', {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: 1_760_000_000 }] },
      }),
    )
    expect(basil).toMatchObject({ periodEnd: new Date(1_760_000_000 * 1000) })
  })

  it('a deleted subscription maps to its own event', () => {
    expect(toInternalEvent(envelope('customer.subscription.deleted', { id: 'sub_1' }))).toEqual({
      kind: 'subscription-deleted',
      subscriptionId: 'sub_1',
    })
  })
})

describe('reversals', () => {
  it('a refund and a dispute both become payment-reversed', () => {
    expect(
      toInternalEvent(
        envelope('charge.refunded', {
          id: 'ch_1',
          payment_intent: 'pi_1',
          amount_refunded: 1200,
          currency: 'gbp',
        }),
      ),
    ).toEqual({
      kind: 'payment-reversed',
      reversal: 'refund',
      paymentIntentId: 'pi_1',
      amountMinor: 1200,
      currency: 'gbp',
      stripeRef: 'ch_1',
    })

    expect(
      toInternalEvent(
        envelope('charge.dispute.created', {
          id: 'dp_1',
          payment_intent: { id: 'pi_1' },
          amount: 1200,
          currency: 'gbp',
        }),
      ),
    ).toMatchObject({ kind: 'payment-reversed', reversal: 'chargeback', paymentIntentId: 'pi_1' })
  })
})

describe('everything else', () => {
  it('is noted and ignored, never an error', () => {
    expect(toInternalEvent(envelope('product.updated', { id: 'prod_1' }))).toEqual({
      kind: 'unhandled',
      type: 'product.updated',
    })
  })
})
