import 'server-only'

import { env, logger, readPluginEnv } from '@meith/core'
import {
  FAKE_STRIPE_MOUNT,
  type FakeStripeRequest,
  type FakeStripeResponse,
  fakeStripe,
} from '@meith/demo'
import { signStripePayload } from '@meith/plugin-dues'
import { resolvePluginSettings } from '@meith/plugin-kit'

import { boardUrl } from './board-url'
import { activeDefinitions } from './plugin-host'
import { dispatchPluginRoute } from './plugin-routes'
import { getSettingOverrides } from './settings'

const DUES = 'dues'

const SETTLED = new Set(['granted', 'already-settled', 'paid-but-grant-refused'])

interface Global {
  __meithFakeStripe?: Map<string, ReturnType<typeof fakeStripe>>
}

function instance(publicBase: string): ReturnType<typeof fakeStripe> {
  const store = (globalThis as Global).__meithFakeStripe ?? new Map()
  ;(globalThis as Global).__meithFakeStripe = store

  const existing = store.get(publicBase)
  if (existing !== undefined) return existing

  const made = fakeStripe({ publicBase })
  store.set(publicBase, made)
  return made
}

export async function handleFakeStripe(request: Request, path: string): Promise<Response> {
  if (!env.DEMO_MODE) return new Response('Not found', { status: 404 })

  const url = new URL(request.url)
  const call: FakeStripeRequest = {
    method: request.method,
    path: path === '' ? '/' : `/${path}`,
    body: request.method === 'POST' ? await request.text() : '',
    query: url.searchParams,
  }

  const outcome = instance(`${await boardUrl()}${FAKE_STRIPE_MOUNT}`).handle(call)
  if (outcome.event !== null) await deliver(outcome.event)
  return respond(outcome.response)
}

function respond(response: FakeStripeResponse): Response {
  if (response.kind === 'redirect') {
    return new Response(null, { status: 303, headers: { location: response.to } })
  }

  const contentType =
    response.kind === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'
  const body = response.kind === 'json' ? JSON.stringify(response.body) : response.body

  return new Response(body, {
    status: response.status,
    headers: { 'content-type': contentType, 'cache-control': 'no-store' },
  })
}

async function deliver(event: unknown): Promise<void> {
  const definition = activeDefinitions().find((candidate) => candidate.key === DUES)
  if (definition === undefined) return

  const settings = resolvePluginSettings(definition, await getSettingOverrides(), readPluginEnv)
  const secret = String(settings.stripe_webhook_secret ?? '')
  if (secret === '') {
    logger().warn('the demo Stripe has no webhook secret to sign with')
    return
  }

  const body = JSON.stringify(event)
  const signature = signStripePayload(body, secret, Math.floor(Date.now() / 1000))
  const board = await boardUrl()

  const response = await dispatchPluginRoute(
    new Request(`${board}/api/plugins/${DUES}/hook/stripe`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    }),
    DUES,
    ['hook', 'stripe'],
  )

  const outcome = response.ok
    ? String(((await response.json()) as { outcome?: unknown }).outcome ?? 'unknown')
    : 'rejected'

  if (!SETTLED.has(outcome)) {
    logger().warn(
      { status: response.status, outcome },
      'the demo Stripe delivered a webhook the board did not act on',
    )
  }
}
