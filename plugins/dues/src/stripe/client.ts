
export interface StripeClientOptions {
  readonly secretKey: string
  readonly apiVersion: string
  readonly apiBase?: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  readonly maxAttempts?: number
  readonly backoff?: (attempt: number) => Promise<void>
}

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly type: string | null,
  ) {
    super(message)
    this.name = 'StripeError'
  }

  get transient(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

export function encodeStripeForm(body: Record<string, unknown>): string {
  const pairs: string[] = []

  const walk = (prefix: string, value: unknown): void => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(`${prefix}[${index}]`, entry))
      return
    }
    if (typeof value === 'object') {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        walk(prefix === '' ? key : `${prefix}[${key}]`, entry)
      }
      return
    }
    pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`)
  }

  walk('', body)
  return pairs.join('&')
}

export interface CheckoutSessionState {
  readonly id: string
  readonly url: string | null
  readonly status: 'open' | 'complete' | 'expired'
  readonly paymentStatus: 'paid' | 'unpaid' | 'no_payment_required'
  readonly amountTotal: number | null
  readonly currency: string | null
  readonly subscriptionId: string | null
  readonly paymentIntentId: string | null
  readonly customerId: string | null
}

export interface SubscriptionState {
  readonly id: string
  readonly status: string
  readonly cancelAtPeriodEnd: boolean
  readonly currentPeriodEnd: Date | null
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

export function sessionFromApi(body: Record<string, unknown>): CheckoutSessionState {
  return {
    id: String(body.id),
    url: typeof body.url === 'string' ? body.url : null,
    status: (body.status ?? 'open') as CheckoutSessionState['status'],
    paymentStatus: (body.payment_status ?? 'unpaid') as CheckoutSessionState['paymentStatus'],
    amountTotal: typeof body.amount_total === 'number' ? body.amount_total : null,
    currency: typeof body.currency === 'string' ? body.currency : null,
    subscriptionId: str(body.subscription),
    paymentIntentId: str(body.payment_intent),
    customerId: str(body.customer),
  }
}

export function subscriptionFromApi(body: Record<string, unknown>): SubscriptionState {
  let periodEnd: number | null = typeof body.current_period_end === 'number' ? body.current_period_end : null

  if (periodEnd === null) {
    const items = (body.items as { data?: unknown } | undefined)?.data
    if (Array.isArray(items)) {
      for (const item of items) {
        const end = (item as { current_period_end?: unknown }).current_period_end
        if (typeof end === 'number' && (periodEnd === null || end > periodEnd)) periodEnd = end
      }
    }
  }

  return {
    id: String(body.id),
    status: String(body.status ?? 'unknown'),
    cancelAtPeriodEnd: body.cancel_at_period_end === true,
    currentPeriodEnd: periodEnd === null ? null : new Date(periodEnd * 1000),
  }
}

export interface StripeClient {
  createCustomer(input: {
    readonly metadata: Readonly<Record<string, string>>
  }): Promise<{ readonly id: string }>

  createCoupon(input: {
    readonly percentOff: number
    readonly name: string
    readonly reference: string
  }): Promise<{ readonly id: string }>

  createProduct(input: {
    readonly name: string
    readonly reference: string
  }): Promise<{ readonly id: string }>

  createPrice(input: {
    readonly productId: string
    readonly unitAmount: number
    readonly currency: string
    readonly interval: 'month' | 'year'
    readonly reference: string
  }): Promise<{ readonly id: string }>

  createCheckoutSession(input: Record<string, unknown>): Promise<CheckoutSessionState>
  getCheckoutSession(id: string): Promise<CheckoutSessionState>

  getSubscription(id: string): Promise<SubscriptionState>
  setCancelAtPeriodEnd(id: string, cancel: boolean): Promise<SubscriptionState>

  createBillingPortalSession(input: {
    readonly customer: string
    readonly returnUrl: string
  }): Promise<{ readonly url: string }>
}

const DEFAULT_BASE = 'https://api.stripe.com'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_ATTEMPTS = 3

export function createStripeClient(options: StripeClientOptions): StripeClient {
  const base = (options.apiBase ?? DEFAULT_BASE).replace(/\/$/, '')
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxAttempts = options.maxAttempts ?? DEFAULT_ATTEMPTS
  const backoff =
    options.backoff ??
    ((attempt: number) =>
      new Promise<void>((resolve) =>
        setTimeout(resolve, 250 * 2 ** attempt + Math.floor(Math.random() * 100)),
      ))

  async function request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await backoff(attempt)

      let response: Response
      try {
        response = await doFetch(`${base}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${options.secretKey}`,
            'stripe-version': options.apiVersion,
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/x-www-form-urlencoded' }),
            ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
          },
          ...(body === undefined ? {} : { body: encodeStripeForm(body) }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        lastError = error
        continue
      }

      const text = await response.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text) as Record<string, unknown>
      } catch {
        parsed = {}
      }

      if (response.ok) return parsed

      const detail = (parsed.error ?? {}) as {
        message?: string
        code?: string
        type?: string
      }
      const error = new StripeError(
        detail.message ?? `Stripe answered ${response.status}`,
        response.status,
        detail.code ?? null,
        detail.type ?? null,
      )
      if (!error.transient) throw error
      lastError = error
    }

    throw lastError instanceof Error
      ? lastError
      : new StripeError('Stripe was unreachable', 0, null, null)
  }

  return {
    async createCustomer(input) {
      const body = await request('POST', '/v1/customers', { metadata: input.metadata })
      return { id: String(body.id) }
    },

    async createCoupon(input) {
      const body = await request(
        'POST',
        '/v1/coupons',
        { percent_off: input.percentOff, duration: 'once', name: input.name },
        `dues-coupon-${input.reference}`,
      )
      return { id: String(body.id) }
    },

    async createProduct(input) {
      const body = await request(
        'POST',
        '/v1/products',
        { name: input.name },
        `dues-product-${input.reference}`,
      )
      return { id: String(body.id) }
    },

    async createPrice(input) {
      const body = await request(
        'POST',
        '/v1/prices',
        {
          product: input.productId,
          unit_amount: input.unitAmount,
          currency: input.currency,
          recurring: { interval: input.interval },
        },
        `dues-price-${input.reference}`,
      )
      return { id: String(body.id) }
    },

    async createCheckoutSession(input) {
      const idempotencyKey =
        typeof input.client_reference_id === 'string'
          ? `dues-session-${input.client_reference_id}`
          : undefined
      return sessionFromApi(await request('POST', '/v1/checkout/sessions', input, idempotencyKey))
    },

    async getCheckoutSession(id) {
      return sessionFromApi(await request('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`))
    },

    async getSubscription(id) {
      return subscriptionFromApi(
        await request('GET', `/v1/subscriptions/${encodeURIComponent(id)}`),
      )
    },

    async setCancelAtPeriodEnd(id, cancel) {
      return subscriptionFromApi(
        await request(
          'POST',
          `/v1/subscriptions/${encodeURIComponent(id)}`,
          { cancel_at_period_end: cancel },
          `dues-cancel-${id}-${cancel ? 'on' : 'off'}`,
        ),
      )
    },

    async createBillingPortalSession(input) {
      const body = await request('POST', '/v1/billing_portal/sessions', {
        customer: input.customer,
        return_url: input.returnUrl,
      })
      return { url: String(body.url) }
    },
  }
}
