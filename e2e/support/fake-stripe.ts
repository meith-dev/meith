import { createServer } from 'node:http'

import { E2E_FAKE_STRIPE_PORT } from './config'

interface FakeSession {
  readonly id: string
  readonly mode: string
  readonly amount: number | null
  readonly currency: string | null
  readonly successUrl: string
  readonly cancelUrl: string
  readonly clientReferenceId: string | null
  paid: boolean
  expired: boolean
}

const sessions = new Map<string, FakeSession>()
let counter = 0

function formValue(form: URLSearchParams, key: string): string | null {
  return form.get(key)
}

function json(body: unknown, status = 200): { status: number; body: string; type: string } {
  return { status, body: JSON.stringify(body), type: 'application/json' }
}

function html(body: string, status = 200): { status: number; body: string; type: string } {
  return { status, body, type: 'text/html; charset=utf-8' }
}

function sessionJson(session: FakeSession): Record<string, unknown> {
  return {
    id: session.id,
    object: 'checkout.session',
    url: `http://127.0.0.1:${E2E_FAKE_STRIPE_PORT}/checkout/${session.id}`,
    status: session.expired ? 'expired' : session.paid ? 'complete' : 'open',
    payment_status: session.paid ? 'paid' : 'unpaid',
    amount_total: session.amount,
    currency: session.currency,
    client_reference_id: session.clientReferenceId,
    subscription: session.mode === 'subscription' && session.paid ? `sub_${session.id}` : null,
    payment_intent: session.mode === 'payment' && session.paid ? `pi_${session.id}` : null,
    customer: 'cus_e2e',
  }
}

function checkoutPage(session: FakeSession): string {
  return `<!doctype html>
<html><head><title>Fake Stripe checkout</title></head>
<body style="font-family: system-ui; max-width: 30rem; margin: 4rem auto;">
  <h1>Fake Stripe</h1>
  <p>Session <code>${session.id}</code> — ${String(session.amount)} ${String(session.currency)}.</p>
  <p><a href="/checkout/${session.id}/complete" id="pay">Complete payment</a></p>
  <p><a href="${session.cancelUrl}" id="cancel">Cancel and go back</a></p>
</body></html>`
}

const server = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => chunks.push(chunk))
  request.on('end', () => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${E2E_FAKE_STRIPE_PORT}`)
    const body = Buffer.concat(chunks).toString('utf8')
    const answer = route(request.method ?? 'GET', url, body)

    if ('redirect' in answer) {
      response.writeHead(302, { location: answer.redirect })
      response.end()
      return
    }
    response.writeHead(answer.status, { 'content-type': answer.type })
    response.end(answer.body)
  })
})

function route(
  method: string,
  url: URL,
  body: string,
):
  | { status: number; body: string; type: string }
  | { redirect: string } {
  if (method === 'POST' && url.pathname === '/v1/customers') {
    counter += 1
    return json({ id: `cus_e2e_${counter}`, object: 'customer' })
  }

  if (method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    const form = new URLSearchParams(body)
    counter += 1
    const priceId = formValue(form, 'line_items[0][price]')
    const session: FakeSession = {
      id: `cs_e2e_${counter}`,
      mode: formValue(form, 'mode') ?? 'payment',
      amount:
        priceId === 'price_e2e_supporter_month'
          ? 500
          : Number(formValue(form, 'line_items[0][price_data][unit_amount]') ?? '0') || null,
      currency:
        priceId === 'price_e2e_supporter_month'
          ? 'gbp'
          : formValue(form, 'line_items[0][price_data][currency]'),
      successUrl: formValue(form, 'success_url') ?? '',
      cancelUrl: formValue(form, 'cancel_url') ?? '',
      clientReferenceId: formValue(form, 'client_reference_id'),
      paid: false,
      expired: false,
    }
    sessions.set(session.id, session)
    return json(sessionJson(session))
  }

  const apiSession = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/)
  if (method === 'GET' && apiSession !== null) {
    const session = sessions.get(apiSession[1] as string)
    return session === undefined
      ? json({ error: { message: 'No such checkout session' } }, 404)
      : json(sessionJson(session))
  }

  if (method === 'GET' && url.pathname.match(/^\/v1\/subscriptions\/[^/]+$/)) {
    const id = url.pathname.split('/').at(-1) as string
    return json({
      id,
      object: 'subscription',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
    })
  }

  if (method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
    const form = new URLSearchParams(body)
    return json({
      id: 'bps_e2e',
      url: `http://127.0.0.1:${E2E_FAKE_STRIPE_PORT}/portal?return=${encodeURIComponent(
        formValue(form, 'return_url') ?? '',
      )}`,
    })
  }

  if (method === 'GET' && url.pathname === '/portal') {
    const back = url.searchParams.get('return') ?? '/'
    return html(
      `<!doctype html><html><head><title>Fake billing portal</title></head>
       <body style="font-family: system-ui; max-width: 30rem; margin: 4rem auto;">
       <h1>Fake billing portal</h1>
       <p><a href="${back}" id="back">Back to the board</a></p></body></html>`,
    )
  }

  const checkout = url.pathname.match(/^\/checkout\/([^/]+)$/)
  if (method === 'GET' && checkout !== null) {
    const session = sessions.get(checkout[1] as string)
    return session === undefined ? html('<h1>No such session</h1>', 404) : html(checkoutPage(session))
  }

  const complete = url.pathname.match(/^\/checkout\/([^/]+)\/complete$/)
  if (method === 'GET' && complete !== null) {
    const session = sessions.get(complete[1] as string)
    if (session === undefined) return html('<h1>No such session</h1>', 404)
    session.paid = true
    return { redirect: session.successUrl }
  }

  return json({ error: { message: `No fake for ${method} ${url.pathname}` } }, 404)
}

server.listen(E2E_FAKE_STRIPE_PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console -- this is a process; its output is its status
  console.log(`fake stripe listening on http://127.0.0.1:${E2E_FAKE_STRIPE_PORT}`)
})
