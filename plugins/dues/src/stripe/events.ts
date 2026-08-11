
export interface StripeEventEnvelope {
  readonly id: string
  readonly type: string
  readonly object: Record<string, unknown>
}

export function parseEventEnvelope(payload: unknown): StripeEventEnvelope | null {
  if (typeof payload !== 'object' || payload === null) return null
  const event = payload as Record<string, unknown>
  if (typeof event.id !== 'string' || typeof event.type !== 'string') return null
  const data = event.data as { object?: unknown } | undefined
  const object = data?.object
  if (typeof object !== 'object' || object === null) return null
  return { id: event.id, type: event.type, object: object as Record<string, unknown> }
}

export type InternalEvent =
  | {
      readonly kind: 'checkout-settled'
      readonly sessionId: string
      readonly paid: boolean
      readonly amountTotal: number | null
      readonly currency: string | null
      readonly subscriptionId: string | null
      readonly paymentIntentId: string | null
      readonly customerId: string | null
    }
  | { readonly kind: 'checkout-failed'; readonly sessionId: string }
  | { readonly kind: 'checkout-expired'; readonly sessionId: string }
  | {
      readonly kind: 'invoice-paid'
      readonly subscriptionId: string | null
      readonly periodEnd: Date | null
      readonly amountPaid: number
      readonly currency: string | null
      readonly billingReason: string | null
    }
  | { readonly kind: 'invoice-failed'; readonly subscriptionId: string | null }
  | {
      readonly kind: 'subscription-updated'
      readonly subscriptionId: string
      readonly cancelAtPeriodEnd: boolean
      readonly periodEnd: Date | null
      readonly status: string
    }
  | { readonly kind: 'subscription-deleted'; readonly subscriptionId: string }
  | {
      readonly kind: 'payment-reversed'
      readonly reversal: 'refund' | 'chargeback'
      readonly paymentIntentId: string | null
      readonly amountMinor: number
      readonly currency: string | null
      readonly stripeRef: string | null
    }
  | { readonly kind: 'unhandled'; readonly type: string }

function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id
  }
  return null
}

function invoiceSubscriptionId(invoice: Record<string, unknown>): string | null {
  const direct = idOf(invoice.subscription)
  if (direct !== null) return direct

  const parent = invoice.parent as
    | { subscription_details?: { subscription?: unknown } }
    | undefined
  return idOf(parent?.subscription_details?.subscription)
}

function invoicePeriodEnd(invoice: Record<string, unknown>): Date | null {
  const lines = (invoice.lines as { data?: unknown } | undefined)?.data
  let latest: number | null = null
  if (Array.isArray(lines)) {
    for (const line of lines) {
      const end = ((line as { period?: { end?: unknown } }).period ?? {}).end
      if (typeof end === 'number' && (latest === null || end > latest)) latest = end
    }
  }
  if (latest === null && typeof invoice.period_end === 'number') latest = invoice.period_end
  return latest === null ? null : new Date(latest * 1000)
}

function subscriptionPeriodEnd(subscription: Record<string, unknown>): Date | null {
  if (typeof subscription.current_period_end === 'number') {
    return new Date(subscription.current_period_end * 1000)
  }
  const items = (subscription.items as { data?: unknown } | undefined)?.data
  let latest: number | null = null
  if (Array.isArray(items)) {
    for (const item of items) {
      const end = (item as { current_period_end?: unknown }).current_period_end
      if (typeof end === 'number' && (latest === null || end > latest)) latest = end
    }
  }
  return latest === null ? null : new Date(latest * 1000)
}

export function toInternalEvent(envelope: StripeEventEnvelope): InternalEvent {
  const object = envelope.object

  switch (envelope.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return {
        kind: 'checkout-settled',
        sessionId: String(object.id),
        paid: object.payment_status === 'paid' || object.payment_status === 'no_payment_required',
        amountTotal: typeof object.amount_total === 'number' ? object.amount_total : null,
        currency: typeof object.currency === 'string' ? object.currency : null,
        subscriptionId: idOf(object.subscription),
        paymentIntentId: idOf(object.payment_intent),
        customerId: idOf(object.customer),
      }

    case 'checkout.session.async_payment_failed':
      return { kind: 'checkout-failed', sessionId: String(object.id) }

    case 'checkout.session.expired':
      return { kind: 'checkout-expired', sessionId: String(object.id) }

    case 'invoice.paid':
      return {
        kind: 'invoice-paid',
        subscriptionId: invoiceSubscriptionId(object),
        periodEnd: invoicePeriodEnd(object),
        amountPaid: typeof object.amount_paid === 'number' ? object.amount_paid : 0,
        currency: typeof object.currency === 'string' ? object.currency : null,
        billingReason: typeof object.billing_reason === 'string' ? object.billing_reason : null,
      }

    case 'invoice.payment_failed':
      return { kind: 'invoice-failed', subscriptionId: invoiceSubscriptionId(object) }

    case 'customer.subscription.updated':
      return {
        kind: 'subscription-updated',
        subscriptionId: String(object.id),
        cancelAtPeriodEnd: object.cancel_at_period_end === true,
        periodEnd: subscriptionPeriodEnd(object),
        status: String(object.status ?? 'unknown'),
      }

    case 'customer.subscription.deleted':
      return { kind: 'subscription-deleted', subscriptionId: String(object.id) }

    case 'charge.refunded':
      return {
        kind: 'payment-reversed',
        reversal: 'refund',
        paymentIntentId: idOf(object.payment_intent),
        amountMinor: typeof object.amount_refunded === 'number' ? object.amount_refunded : 0,
        currency: typeof object.currency === 'string' ? object.currency : null,
        stripeRef: typeof object.id === 'string' ? object.id : null,
      }

    case 'charge.dispute.created':
      return {
        kind: 'payment-reversed',
        reversal: 'chargeback',
        paymentIntentId: idOf(object.payment_intent),
        amountMinor: typeof object.amount === 'number' ? object.amount : 0,
        currency: typeof object.currency === 'string' ? object.currency : null,
        stripeRef: typeof object.id === 'string' ? object.id : null,
      }

    default:
      return { kind: 'unhandled', type: envelope.type }
  }
}

export const SUBSCRIBED_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
  'charge.dispute.created',
] as const
