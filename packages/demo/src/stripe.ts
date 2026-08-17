import { DUES_DEMO_PRICES } from '@meith/plugin-dues'

export const FAKE_STRIPE_MOUNT = '/demo/stripe'

export interface FakeStripeRequest {
  readonly method: string
  readonly path: string
  readonly body: string
  readonly query: URLSearchParams
}

export type FakeStripeResponse =
  | { readonly kind: 'json'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'html'; readonly status: number; readonly body: string }
  | { readonly kind: 'redirect'; readonly to: string }

export interface FakeStripeOutcome {
  readonly response: FakeStripeResponse
  readonly event: unknown | null
}

export interface FakeStripeOptions {
  readonly publicBase: string
  readonly now?: (() => Date) | undefined
}

export interface FakeStripe {
  handle(request: FakeStripeRequest): FakeStripeOutcome
}

interface Session {
  readonly id: string
  readonly mode: 'payment' | 'subscription'
  readonly amountMinor: number | null
  readonly currency: string | null
  readonly successUrl: string
  readonly cancelUrl: string
  readonly productName: string
  paid: boolean
  subscriptionId: string | null
  paymentIntentId: string | null
}

interface Price {
  readonly unitAmount: number
  readonly currency: string
  readonly name: string
}

const DAY_MS = 86_400_000

export function fakeStripe(options: FakeStripeOptions): FakeStripe {
  const now = options.now ?? (() => new Date())
  const base = options.publicBase.replace(/\/$/, '')

  const sessions = new Map<string, Session>()
  const cancelled = new Set<string>()
  const products = new Map<string, string>()
  const prices = new Map<string, Price>(
    DUES_DEMO_PRICES.map((price) => [
      price.id,
      { unitAmount: price.unitAmount, currency: price.currency, name: price.name },
    ]),
  )
  let counter = 0
  const salt = Math.floor(now().getTime() / 1000).toString(36)

  const next = (prefix: string): string => {
    counter += 1
    return `${prefix}_fake_${salt}_${counter}`
  }

  const json = (body: unknown, status = 200): FakeStripeOutcome => ({
    response: { kind: 'json', status, body },
    event: null,
  })
  const html = (body: string, status = 200): FakeStripeOutcome => ({
    response: { kind: 'html', status, body },
    event: null,
  })

  const sessionBody = (session: Session): Record<string, unknown> => ({
    id: session.id,
    object: 'checkout.session',
    url: `${base}/checkout/${session.id}`,
    status: session.paid ? 'complete' : 'open',
    payment_status: session.paid ? 'paid' : 'unpaid',
    amount_total: session.amountMinor,
    currency: session.currency,
    subscription: session.subscriptionId,
    payment_intent: session.paymentIntentId,
    customer: 'cus_demo',
  })

  const subscriptionBody = (id: string): Record<string, unknown> => ({
    id,
    object: 'subscription',
    status: id.includes('lapsed') ? 'past_due' : id.includes('ended') ? 'canceled' : 'active',
    cancel_at_period_end: cancelled.has(id) || id.includes('leaving'),
    current_period_end: Math.floor((now().getTime() + 30 * DAY_MS) / 1000),
  })

  return {
    handle(request) {
      const form = new URLSearchParams(request.body)
      const path = request.path === '' ? '/' : request.path

      if (request.method === 'POST' && path === '/v1/customers') {
        return json({ id: next('cus'), object: 'customer' })
      }

      if (request.method === 'POST' && path === '/v1/coupons') {
        return json({ id: next('coupon'), object: 'coupon' })
      }

      if (request.method === 'POST' && path === '/v1/products') {
        const id = next('prod')
        products.set(id, form.get('name') ?? 'Membership')
        return json({ id, object: 'product' })
      }

      if (request.method === 'POST' && path === '/v1/prices') {
        const id = next('price')
        prices.set(id, {
          unitAmount: Number(form.get('unit_amount') ?? '0'),
          currency: form.get('currency') ?? 'gbp',
          name: products.get(form.get('product') ?? '') ?? 'Membership',
        })
        return json({ id, object: 'price' })
      }

      if (request.method === 'POST' && path === '/v1/checkout/sessions') {
        const listed = prices.get(form.get('line_items[0][price]') ?? '')
        const session: Session = {
          id: next('cs'),
          mode: form.get('mode') === 'subscription' ? 'subscription' : 'payment',
          amountMinor:
            listed?.unitAmount ?? Number(form.get('line_items[0][price_data][unit_amount]') ?? '0'),
          currency: listed?.currency ?? form.get('line_items[0][price_data][currency]') ?? 'gbp',
          successUrl: form.get('success_url') ?? base,
          cancelUrl: form.get('cancel_url') ?? base,
          productName:
            form.get('line_items[0][price_data][product_data][name]') ??
            listed?.name ??
            'Membership',
          paid: false,
          subscriptionId: null,
          paymentIntentId: null,
        }
        sessions.set(session.id, session)
        return json(sessionBody(session))
      }

      const read = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path)
      if (request.method === 'GET' && read !== null) {
        const session = sessions.get(read[1] as string)
        return session === undefined
          ? json({ id: read[1], object: 'checkout.session', status: 'expired' })
          : json(sessionBody(session))
      }

      const subscription = /^\/v1\/subscriptions\/([^/]+)$/.exec(path)
      if (subscription !== null) {
        const id = subscription[1] as string
        if (request.method === 'POST' && form.get('cancel_at_period_end') === 'true') {
          cancelled.add(id)
        }
        return json(subscriptionBody(id))
      }

      if (request.method === 'POST' && path === '/v1/billing_portal/sessions') {
        const back = form.get('return_url') ?? base
        return json({
          id: next('bps'),
          url: `${base}/portal?return=${encodeURIComponent(back)}`,
        })
      }

      const checkout = /^\/checkout\/([^/]+)$/.exec(path)
      if (checkout !== null) {
        const session = sessions.get(checkout[1] as string)
        return session === undefined
          ? html(gonePage(), 404)
          : html(checkoutPage(session, `${base}/checkout/${session.id}/pay`))
      }

      const pay = /^\/checkout\/([^/]+)\/pay$/.exec(path)
      if (request.method === 'POST' && pay !== null) {
        const session = sessions.get(pay[1] as string)
        if (session === undefined) return html(gonePage(), 404)

        if (!session.paid) {
          session.paid = true
          if (session.mode === 'subscription') session.subscriptionId = next('sub')
          else session.paymentIntentId = next('pi')
        }

        return {
          response: { kind: 'redirect', to: session.successUrl },
          event: {
            id: next('evt'),
            type: 'checkout.session.completed',
            created: Math.floor(now().getTime() / 1000),
            data: { object: sessionBody(session) },
          },
        }
      }

      if (path === '/portal') {
        return html(portalPage(request.query.get('return') ?? base))
      }

      return json({ error: { message: `No fake for ${request.method} ${path}` } }, 404)
    },
  }
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 3rem 1.25rem;
         display: flex; justify-content: center; background: #f6f7f9; color: #1a1f36; }
  main { width: 100%; max-width: 26rem; background: #fff; border-radius: 12px;
         padding: 1.75rem; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  h1 { font-size: 1.05rem; margin: 0 0 .25rem; letter-spacing: .01em; }
  .flag { display: inline-block; font-size: .75rem; text-transform: uppercase;
          letter-spacing: .08em; color: #a26100; background: #fff5d6;
          border-radius: 999px; padding: .15rem .6rem; margin-bottom: 1rem; }
  .amount { font-size: 2rem; font-weight: 600; margin: .5rem 0 1.25rem; }
  p { color: #4f566b; margin: .5rem 0; }
  button { width: 100%; font: inherit; font-weight: 600; color: #fff; cursor: pointer;
           background: #635bff; border: 0; border-radius: 8px; padding: .7rem 1rem; }
  a { color: #635bff; }
  .quiet { display: block; text-align: center; margin-top: 1rem; font-size: .9rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #14161c; color: #e8eaf0; }
    main { background: #1d212b; box-shadow: none; }
    p { color: #a5adc0; }
  }
</style>
</head><body><main>${body}</main></body></html>`
}

function checkoutPage(session: Session, payUrl: string): string {
  const amount = money(session.amountMinor, session.currency)
  const recurring = session.mode === 'subscription' ? ' per month' : ''

  return page(
    'Checkout — not Stripe',
    `<span class="flag">Not Stripe</span>
     <h1>${escapeHtml(session.productName)}</h1>
     <p class="amount">${amount}${recurring}</p>
     <p>This board is a demo, so it has no Stripe account and this page is a stand-in for
        one. No card is asked for and no money moves. Pay, and the board is told the way
        Stripe would tell it — a signed event to its webhook.</p>
     <form method="post" action="${escapeHtml(payUrl)}"><button type="submit">Pay ${amount}</button></form>
     <a class="quiet" href="${escapeHtml(session.cancelUrl)}">Cancel and go back</a>`,
  )
}

function portalPage(back: string): string {
  return page(
    'Billing portal — not Stripe',
    `<span class="flag">Not Stripe</span>
     <h1>Billing portal</h1>
     <p>Stripe's own portal is where a member changes their card or downloads receipts.
        There is nothing behind this one.</p>
     <a class="quiet" href="${escapeHtml(back)}">Back to the board</a>`,
  )
}

function gonePage(): string {
  return page(
    'No such checkout',
    `<h1>No such checkout</h1>
     <p>This demo resets on a timer, and its Stripe forgets along with it.</p>`,
  )
}

function money(amountMinor: number | null, currency: string | null): string {
  const symbol = currency === 'gbp' ? '£' : currency === 'usd' ? '$' : currency === 'eur' ? '€' : ''
  const value = ((amountMinor ?? 0) / 100).toFixed(2)
  return symbol === '' ? `${value} ${(currency ?? '').toUpperCase()}` : `${symbol}${value}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
