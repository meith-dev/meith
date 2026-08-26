import type { PluginRequest, PluginResponse, PluginRuntimeContext } from '@meith/plugin-kit'

import { codeProblem, discountedPrice, normalizeCode } from './codes'
import type { DuesConfig } from './config'
import { applyInternalEvent, type EntitlementDeps, settlePaidOrder } from './entitlement'
import { isLifetime, sellablePlanByKey } from './plans'
import {
  attachCheckoutSession,
  type CodeRow,
  codeByCode,
  findStripeCustomer,
  insertOrder,
  liveMembership,
  markEventFailed,
  markEventProcessed,
  membershipById,
  recordEvent,
  saveCodeCoupon,
  saveStripeCustomer,
  setMembershipStatus,
} from './store'
import { createStripeClient, type StripeClient, StripeError } from './stripe/client'
import { parseEventEnvelope, toInternalEvent } from './stripe/events'
import { verifyStripeSignature } from './stripe/webhook'

export interface DuesServices {
  readonly config: DuesConfig
  readonly context: PluginRuntimeContext
  readonly stripe: StripeClient | null
  readonly webhookSecret: string
  readonly now: () => Date
}

export function buildServices(
  config: DuesConfig,
  context: PluginRuntimeContext,
  overrides: { readonly stripe?: StripeClient | null; readonly now?: () => Date } = {},
): DuesServices {
  const secretKey = String(context.settings.stripe_secret_key ?? '')
  const stripe =
    overrides.stripe !== undefined
      ? overrides.stripe
      : secretKey === ''
        ? null
        : createStripeClient({
            secretKey,
            apiVersion: String(context.settings.stripe_api_version ?? ''),
            ...(String(context.settings.stripe_api_base ?? '') === ''
              ? {}
              : { apiBase: String(context.settings.stripe_api_base) }),
          })

  return {
    config,
    context,
    stripe,
    webhookSecret: String(context.settings.stripe_webhook_secret ?? ''),
    now: overrides.now ?? (() => new Date()),
  }
}

export function entitlementDeps(services: DuesServices): EntitlementDeps {
  return {
    config: services.config,
    data: services.context.data,
    grants: services.context.grants,
    notify: services.context.notify,
    log: (message, detail) => services.context.logger.warn(message, detail),
    now: services.now,
  }
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

function isLoopbackHost(host: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(`http://${host}`)
  } catch {
    return false
  }
  return LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())
}

export function requestOrigin(request: PluginRequest): string {
  if (request.boardUrl !== '') return request.boardUrl
  const host = request.headers.host ?? ''
  return isLoopbackHost(host) ? `http://${host}` : ''
}

function back(query: Record<string, string>): PluginResponse {
  const params = new URLSearchParams(query).toString()
  return { kind: 'redirect', to: `/plugins/dues${params === '' ? '' : `?${params}`}` }
}

function offsite(to: string): PluginResponse {
  return { kind: 'redirect', to: `/plugins/dues/go?to=${encodeURIComponent(to)}` }
}

function backToManage(query: Record<string, string>): PluginResponse {
  const params = new URLSearchParams(query).toString()
  return { kind: 'redirect', to: `/plugins/dues/manage${params === '' ? '' : `?${params}`}` }
}

const REUSABLE_CHECKOUT_MS = 25 * 60 * 1000

export async function handleCheckout(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const buyerId = request.viewer.userId
  if (buyerId === null) return back({ error: 'sign-in' })

  const planKey = request.form?.plan ?? ''
  const plan = await sellablePlanByKey(services.context.data, services.config, planKey)
  if (plan === null || plan.hidden) return back({ error: 'unknown-plan' })

  if (plan.mode === 'auto' && plan.stripePriceId === null) {
    return back({ error: 'plan-not-ready', plan: plan.key })
  }

  const recipientInput = (request.form?.recipient ?? '').trim()
  let recipientId = buyerId
  let recipientName: string | null = null
  if (recipientInput !== '') {
    const found = await services.context.users.byUsername(recipientInput)
    if (found === null) {
      return back({ error: 'unknown-recipient', plan: plan.key, recipient: recipientInput })
    }
    recipientId = found.userId
    recipientName = found.username
  }
  const isGift = recipientId !== buyerId

  if (isGift && !plan.giftable) return back({ error: 'gift-not-allowed', plan: plan.key })

  const held = await liveMembership(services.context.data, recipientId, plan.groupKey)
  if (held !== null) {
    if (isLifetime(held.currentPeriodEnd)) {
      return back({ error: 'already-forever', plan: plan.key })
    }
    if (plan.mode === 'auto') return back({ error: 'already-member', plan: plan.key })
    if (plan.mode === 'lifetime' && held.renewalMode === 'auto') {
      return back({ error: 'cancel-first', plan: plan.key })
    }
  }

  const now = services.now()

  const codeInput = normalizeCode(request.form?.code ?? '')
  let code: CodeRow | null = null
  if (codeInput !== '') {
    const bounce = { plan: plan.key, code: codeInput, recipient: recipientInput }
    code = await codeByCode(services.context.data, codeInput)
    if (code === null) return back({ error: 'unknown-code', ...bounce })
    const problem = codeProblem(code, plan.key, now)
    if (problem !== null) return back({ error: `code-${problem}`, ...bounce })
  }

  const charge = code === null ? plan.priceMinor : discountedPrice(plan.priceMinor, code.percentOff)

  if (services.stripe === null && (plan.mode === 'auto' || charge > 0)) {
    return back({ error: 'unconfigured' })
  }

  const minuteBucket = Math.floor(now.getTime() / 60_000)
  const newOrder = (idempotencyKey: string) =>
    insertOrder(services.context.data, {
      buyerUserId: buyerId,
      recipientUserId: recipientId,
      planKey: plan.key,
      planName: plan.name,
      groupKey: plan.groupKey,
      amountMinor: charge,
      currency: plan.currency,
      billingMode: plan.mode,
      periodSpec: plan.mode === 'fixed' ? plan.periodSpec : null,
      idempotencyKey,
      codeId: code?.id ?? null,
      discountMinor: plan.priceMinor - charge,
    })

  const baseKey = `co:${buyerId}:${plan.key}:${recipientId}:${code?.id ?? 0}:${minuteBucket}`
  let { order, created } = await newOrder(baseKey)

  if (!created && order.status !== 'created' && order.status !== 'pending') {
    ;({ order, created } = await newOrder(`${baseKey}:${order.id}`))
  }

  if (!created) {
    if (
      order.checkoutUrl !== null &&
      now.getTime() - order.createdAt.getTime() < REUSABLE_CHECKOUT_MS
    ) {
      return offsite(order.checkoutUrl)
    }
    return back({ error: 'try-again', plan: plan.key })
  }

  if (charge === 0 && plan.mode !== 'auto') {
    await settlePaidOrder(entitlementDeps(services), order, {
      amountTotal: 0,
      currency: plan.currency,
      subscriptionId: null,
      paymentIntentId: null,
    })
    return { kind: 'redirect', to: `/plugins/dues/return?order=${order.id}` }
  }

  if (services.stripe === null) return back({ error: 'unconfigured' })
  const stripe = services.stripe

  const origin = requestOrigin(request)
  if (origin === '') return back({ error: 'unconfigured' })

  try {
    let customerId = await findStripeCustomer(services.context.data, buyerId)
    if (customerId === null) {
      const customer = await stripe.createCustomer({
        metadata: { meith_user_id: String(buyerId) },
      })
      await saveStripeCustomer(services.context.data, buyerId, customer.id)
      customerId = customer.id
    }

    const productName =
      recipientName === null ? plan.name : `${plan.name} — a gift for ${recipientName}`

    let couponId: string | null = null
    if (code !== null && plan.mode === 'auto') {
      couponId = code.stripeCouponId
      if (couponId === null) {
        const coupon = await stripe.createCoupon({
          percentOff: code.percentOff,
          name: `Dues code ${code.code}`,
          reference: String(code.id),
        })
        await saveCodeCoupon(services.context.data, code.id, coupon.id)
        couponId = coupon.id
      }
    }

    const session = await stripe.createCheckoutSession({
      mode: plan.mode === 'auto' ? 'subscription' : 'payment',
      customer: customerId,
      client_reference_id: String(order.id),
      line_items: [
        plan.mode === 'auto'
          ? { price: plan.stripePriceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: plan.currency,
                unit_amount: charge,
                product_data: { name: productName },
              },
            },
      ],
      metadata: { dues_order_id: String(order.id) },
      ...(plan.mode === 'auto'
        ? { subscription_data: { metadata: { dues_order_id: String(order.id) } } }
        : {}),
      ...(couponId === null ? {} : { discounts: [{ coupon: couponId }] }),
      success_url: `${origin}/plugins/dues/return?order=${order.id}`,
      cancel_url: `${origin}/plugins/dues?cancelled=1`,
    })

    await attachCheckoutSession(services.context.data, order.id, {
      id: session.id,
      url: session.url,
    })

    if (session.url === null) return back({ error: 'stripe-error' })
    return offsite(session.url)
  } catch (error) {
    services.context.logger.error('dues: could not start checkout', {
      orderId: order.id,
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof StripeError ? { code: error.code, status: error.status } : {}),
    })
    return back({ error: 'stripe-error', plan: plan.key })
  }
}

export async function handleWebhook(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  if (services.webhookSecret === '') {
    return {
      kind: 'json',
      status: 503,
      body: { error: 'the webhook signing secret is not configured' },
    }
  }
  if (request.rawBody === null) {
    return { kind: 'json', status: 400, body: { error: 'no body' } }
  }

  const verdict = verifyStripeSignature(
    request.rawBody,
    request.headers['stripe-signature'],
    services.webhookSecret,
    services.now(),
  )
  if (!verdict.ok) {
    return { kind: 'json', status: 400, body: { error: `signature ${verdict.reason}` } }
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(request.rawBody))
  } catch {
    return { kind: 'json', status: 400, body: { error: 'unparseable body' } }
  }

  const envelope = parseEventEnvelope(payload)
  if (envelope === null) {
    return { kind: 'json', status: 400, body: { error: 'not an event envelope' } }
  }

  const recorded = await recordEvent(services.context.data, {
    stripeEventId: envelope.id,
    type: envelope.type,
    payload,
  })
  if (!recorded.first) {
    return { kind: 'json', status: 200, body: { received: true, outcome: 'replay' } }
  }

  try {
    const outcome = await applyInternalEvent(entitlementDeps(services), toInternalEvent(envelope))
    await markEventProcessed(services.context.data, recorded.id, outcome)
    return { kind: 'json', status: 200, body: { received: true, outcome } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markEventFailed(services.context.data, recorded.id, `failed: ${message}`)
    services.context.logger.error('dues: webhook processing failed', {
      eventId: envelope.id,
      message,
    })
    return { kind: 'json', status: 200, body: { received: true, outcome: 'deferred' } }
  }
}

export async function handlePortal(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const userId = request.viewer.userId
  if (userId === null) return backToManage({ error: 'sign-in' })
  if (services.stripe === null) return backToManage({ error: 'unconfigured' })

  const origin = requestOrigin(request)
  if (origin === '') return backToManage({ error: 'unconfigured' })

  const customerId = await findStripeCustomer(services.context.data, userId)
  if (customerId === null) return backToManage({ error: 'no-customer' })

  try {
    const portal = await services.stripe.createBillingPortalSession({
      customer: customerId,
      returnUrl: `${origin}/plugins/dues/manage`,
    })
    return offsite(portal.url)
  } catch (error) {
    services.context.logger.error('dues: could not open the billing portal', {
      message: error instanceof Error ? error.message : String(error),
    })
    return backToManage({ error: 'stripe-error' })
  }
}

export async function handleCancel(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const userId = request.viewer.userId
  if (userId === null) return backToManage({ error: 'sign-in' })

  const membershipId = Number(request.form?.membership ?? '')
  if (!Number.isSafeInteger(membershipId) || membershipId <= 0) {
    return backToManage({ error: 'cancel-failed' })
  }

  const membership = await membershipById(services.context.data, membershipId)
  if (membership === null || membership.userId !== userId) {
    return backToManage({ error: 'cancel-failed' })
  }
  if (membership.renewalMode !== 'auto' || membership.stripeSubscriptionId === null) {
    return backToManage({ error: 'cancel-failed' })
  }
  if (services.stripe === null) return backToManage({ error: 'unconfigured' })

  try {
    await services.stripe.setCancelAtPeriodEnd(membership.stripeSubscriptionId, true)
  } catch (error) {
    services.context.logger.error('dues: cancel at period end failed', {
      membershipId,
      message: error instanceof Error ? error.message : String(error),
    })
    return backToManage({ error: 'stripe-error' })
  }

  await setMembershipStatus(services.context.data, membership.id, 'closing')
  return backToManage({ cancelled: '1' })
}
