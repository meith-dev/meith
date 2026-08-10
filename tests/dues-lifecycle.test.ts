import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  ActorBuilder,
  expireTimedGroupMemberships,
  pluginData,
  pluginGrants,
  pluginUsers,
} from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import type {
  PluginRequest,
  PluginRuntimeContext,
} from '@meith/plugin-kit'

import { parseDuesConfig } from '../plugins/dues/src/config'
import { DUES_MIGRATIONS } from '../plugins/dues/src/schema'
import {
  buildServices,
  entitlementDeps,
  handleCancel,
  handleCheckout,
  handleWebhook,
} from '../plugins/dues/src/handlers'
import { runReconcile, runSweep } from '../plugins/dues/src/tasks'
import {
  allMemberships,
  liveMembership,
  membershipsFor,
  orderById,
  orderBySessionId,
  recentLedger,
  recordEvent,
  unprocessedEvents,
} from '../plugins/dues/src/store'
import type {
  CheckoutSessionState,
  StripeClient,
  SubscriptionState,
} from '../plugins/dues/src/stripe/client'
import { signStripePayload } from '../plugins/dues/src/stripe/webhook'

const WEBHOOK_SECRET = 'whsec_lifecycle_suite'

const CONFIG = parseDuesConfig({
  currency: 'gbp',
  graceDays: 7,
  plans: [
    {
      key: 'pass-90',
      name: '90-day pass',
      group: 'supporters',
      price: 1200,
      billing: { mode: 'fixed', period: 'P90D' },
    },
    {
      key: 'supporter-month',
      name: 'Supporter',
      group: 'supporters',
      price: 500,
      billing: { mode: 'auto', interval: 'month', stripePriceId: 'price_month' },
    },
    {
      key: 'locked-pass',
      name: 'Pass into a locked group',
      group: 'staffish',
      price: 700,
      billing: { mode: 'fixed', period: 'P30D' },
    },
  ],
  extraRedirectHosts: ['127.0.0.1'],
})

interface FakeStripe extends StripeClient {
  readonly sessions: Map<string, CheckoutSessionState>
  readonly subscriptions: Map<string, SubscriptionState>
  readonly cancelCalls: string[]
  nextSessionUrl: string
}

function fakeStripe(): FakeStripe {
  let counter = 0
  const sessions = new Map<string, CheckoutSessionState>()
  const subscriptions = new Map<string, SubscriptionState>()
  const cancelCalls: string[] = []

  return {
    sessions,
    subscriptions,
    cancelCalls,
    nextSessionUrl: 'https://checkout.stripe.com/pay/test',

    async createCustomer() {
      counter += 1
      return { id: `cus_${counter}` }
    },

    async createCheckoutSession(input) {
      counter += 1
      const session: CheckoutSessionState = {
        id: `cs_${counter}`,
        url: this.nextSessionUrl,
        status: 'open',
        paymentStatus: 'unpaid',
        amountTotal: null,
        currency: null,
        subscriptionId: null,
        paymentIntentId: null,
        customerId: String(input.customer ?? ''),
      }
      sessions.set(session.id, session)
      return session
    },

    async getCheckoutSession(id) {
      const session = sessions.get(id)
      if (session === undefined) throw new Error(`no fake session ${id}`)
      return session
    },

    async getSubscription(id) {
      const subscription = subscriptions.get(id)
      if (subscription === undefined) throw new Error(`no fake subscription ${id}`)
      return subscription
    },

    async setCancelAtPeriodEnd(id, cancel) {
      cancelCalls.push(`${id}:${cancel}`)
      const existing = subscriptions.get(id) ?? {
        id,
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      }
      const updated = { ...existing, cancelAtPeriodEnd: cancel }
      subscriptions.set(id, updated)
      return updated
    },

    async createBillingPortalSession() {
      return { url: 'https://billing.stripe.com/session/test' }
    },
  }
}

let h: TestDb
let stripe: FakeStripe
let context: PluginRuntimeContext
let alice: number
let bob: number
let membersGroup: number
let logged: Array<{ message: string; detail: unknown }>

const NOW = () => new Date()

function services() {
  return buildServices(CONFIG, context, { stripe, now: NOW })
}

async function exec(sql: string): Promise<void> {
  await h.client.exec(sql)
}

async function member(username: string): Promise<number> {
  const lower = username.toLowerCase()
  await exec(
    `insert into users (username, username_lower, email, email_lower, primary_group_id)
     values ('${username}', '${lower}', '${lower}@example.com', '${lower}@example.com', ${membersGroup})`,
  )
  const result = await h.client.query(`select id from users where username_lower = '${lower}'`)
  return Number((result.rows as Array<{ id: number }>)[0]!.id)
}

function request(
  userId: number | null,
  form: Record<string, string> | null,
  extras: Partial<PluginRequest> = {},
): PluginRequest {
  return {
    viewer: { userId, isGuest: userId === null },
    method: 'POST',
    path: 'checkout',
    query: {},
    headers: { host: '127.0.0.1:3001' },
    rawBody: null,
    form,
    json: null,
    boardUrl: 'http://127.0.0.1:3001',
    ...extras,
  }
}

let eventCounter = 0

function webhookRequest(type: string, object: Record<string, unknown>): PluginRequest {
  eventCounter += 1
  const payload = JSON.stringify({
    id: `evt_${eventCounter}`,
    type,
    data: { object },
  })
  const rawBody = new TextEncoder().encode(payload)
  const header = signStripePayload(rawBody, WEBHOOK_SECRET, Math.floor(Date.now() / 1000))
  return request(null, null, {
    path: 'hook/stripe',
    rawBody,
    headers: { 'stripe-signature': header },
  })
}

async function actorGroups(userId: number): Promise<Set<number>> {
  const actor = await new ActorBuilder(h.db, { guestGroupId: membersGroup }).buildForUser(userId)
  return new Set(actor?.groupIds ?? [])
}

let supportersGroup: number

beforeAll(async () => {
  h = await createTestDb()
  for (const migration of DUES_MIGRATIONS) {
    await h.client.exec(migration.statements.join(';\n'))
  }
})

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await exec(`
    delete from plugin_dues_ledger; delete from plugin_dues_event;
    delete from plugin_dues_membership; delete from plugin_dues_order;
    delete from plugin_dues_customer;
    delete from user_group_memberships; delete from users; delete from usergroups;
    delete from cache_versions;
  `)
  await exec(`insert into usergroups (key, title) values ('members', 'Members')`)
  await exec(
    `insert into usergroups (key, title, plugin_grantable) values ('supporters', 'Supporters', true)`,
  )
  await exec(
    `insert into usergroups (key, title, is_staff_group, plugin_grantable) values ('staffish', 'Staffish', true, true)`,
  )

  const groups = await h.client.query('select id, key from usergroups')
  const rows = groups.rows as Array<{ id: number; key: string }>
  membersGroup = Number(rows.find((row) => row.key === 'members')!.id)
  supportersGroup = Number(rows.find((row) => row.key === 'supporters')!.id)

  alice = await member('Alice')
  bob = await member('Bob')

  stripe = fakeStripe()
  logged = []
  context = {
    settings: {
      stripe_secret_key: 'sk_test_suite',
      stripe_webhook_secret: WEBHOOK_SECRET,
      stripe_api_version: '2024-12-18.acacia',
      stripe_api_base: '',
    },
    logger: {
      info: () => {},
      warn: (message, detail) => logged.push({ message, detail }),
      error: (message, detail) => logged.push({ message, detail }),
    },
    grants: pluginGrants(h.db, 'dues'),
    data: pluginData(h.db, 'dues'),
    users: pluginUsers(h.db),
  }
  eventCounter += 100
})

async function checkout(
  buyer: number,
  plan: string,
  recipient?: string,
): Promise<{ orderId: number; sessionId: string }> {
  const response = await handleCheckout(
    services(),
    request(buyer, { plan, ...(recipient === undefined ? {} : { recipient }) }),
  )
  expect(response).toMatchObject({ kind: 'redirect' })
  const to = (response as { to: string }).to
  expect(to).toBe(`/plugins/dues/go?to=${encodeURIComponent(stripe.nextSessionUrl)}`)

  const sessionId = [...stripe.sessions.keys()].at(-1)!
  const order = await orderBySessionId(context.data, sessionId)
  expect(order).not.toBeNull()
  return { orderId: order!.id, sessionId }
}

function paidSessionEvent(
  sessionId: string,
  overrides: Record<string, unknown> = {},
): PluginRequest {
  return webhookRequest('checkout.session.completed', {
    id: sessionId,
    payment_status: 'paid',
    amount_total: 1200,
    currency: 'gbp',
    subscription: null,
    payment_intent: `pi_for_${sessionId}`,
    customer: 'cus_1',
    ...overrides,
  })
}

describe('buying a pass for yourself', () => {
  it('checkout → signed webhook → group membership, ledger, receipt page state', async () => {
    const { orderId, sessionId } = await checkout(alice, 'pass-90')

    expect((await actorGroups(alice)).has(supportersGroup)).toBe(false)

    const response = await handleWebhook(services(), paidSessionEvent(sessionId))
    expect(response).toMatchObject({ kind: 'json', status: 200 })
    expect((response as { body: { outcome: string } }).body.outcome).toBe('granted')

    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)

    const order = await orderById(context.data, orderId)
    expect(order).toMatchObject({ status: 'paid', stripePaymentIntentId: `pi_for_${sessionId}` })

    const memberships = await membershipsFor(context.data, alice)
    expect(memberships).toHaveLength(1)
    const days =
      (memberships[0]!.currentPeriodEnd.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(89)
    expect(days).toBeLessThan(91)
    expect(
      (memberships[0]!.graceUntil.getTime() - memberships[0]!.currentPeriodEnd.getTime()) /
        86_400_000,
    ).toBeCloseTo(7, 1)

    const ledger = await recentLedger(context.data)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ kind: 'charge', amountMinor: 1200, userId: alice })
  })

  it('a replayed webhook changes nothing', async () => {
    const { sessionId } = await checkout(alice, 'pass-90')
    const event = paidSessionEvent(sessionId)

    await handleWebhook(services(), event)
    const first = await membershipsFor(context.data, alice)

    const replay = await handleWebhook(services(), event)
    expect((replay as { body: { outcome: string } }).body.outcome).toBe('replay')

    const second = await membershipsFor(context.data, alice)
    expect(second).toEqual(first)
    expect(await recentLedger(context.data)).toHaveLength(1)
  })

  it('buying again stacks: the new period starts where the old one ends', async () => {
    const first = await checkout(alice, 'pass-90')
    await handleWebhook(services(), paidSessionEvent(first.sessionId))
    const [before] = await membershipsFor(context.data, alice)

    const second = await checkout(alice, 'pass-90')
    await handleWebhook(services(), paidSessionEvent(second.sessionId))
    const [after] = await membershipsFor(context.data, alice)

    const gained =
      (after!.currentPeriodEnd.getTime() - before!.currentPeriodEnd.getTime()) / 86_400_000
    expect(gained).toBeGreaterThan(89)
    expect(gained).toBeLessThan(91)
    expect(await membershipsFor(context.data, alice)).toHaveLength(1)
  })

  it('an amount mismatch grants nothing and flags the order', async () => {
    const { orderId, sessionId } = await checkout(alice, 'pass-90')

    const response = await handleWebhook(
      services(),
      paidSessionEvent(sessionId, { amount_total: 120 }),
    )
    expect((response as { body: { outcome: string } }).body.outcome).toBe('amount-mismatch')

    expect((await actorGroups(alice)).has(supportersGroup)).toBe(false)
    const order = await orderById(context.data, orderId)
    expect(order?.needsAttention).toContain('120')
    expect(await recentLedger(context.data)).toHaveLength(0)
  })

  it('a payment into a group the host refuses keeps the money visible and grants nothing', async () => {
    const { orderId, sessionId } = await checkout(alice, 'locked-pass')
    const response = await handleWebhook(
      services(),
      paidSessionEvent(sessionId, { amount_total: 700 }),
    )

    expect((response as { body: { outcome: string } }).body.outcome).toBe(
      'paid-but-grant-refused',
    )
    const order = await orderById(context.data, orderId)
    expect(order?.status).toBe('paid')

    const memberships = await allMemberships(context.data)
    expect(memberships[0]?.needsAttention).toContain('staff')
    expect(await recentLedger(context.data)).toHaveLength(1)
    expect(logged.length).toBeGreaterThan(0)
  })
})

describe('gifts', () => {
  it('one member buys, the other belongs', async () => {
    const { sessionId } = await checkout(alice, 'pass-90', 'bob')
    await handleWebhook(services(), paidSessionEvent(sessionId))

    expect((await actorGroups(bob)).has(supportersGroup)).toBe(true)
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(false)

    const ledger = await recentLedger(context.data)
    expect(ledger[0]).toMatchObject({ userId: alice, note: `gift for user ${bob}` })

    const grants = await pluginGrants(h.db, 'dues').list(bob)
    expect(grants[0]?.groupKey).toBe('supporters')
  })

  it('an unknown recipient bounces before any money moves', async () => {
    const response = await handleCheckout(
      services(),
      request(alice, { plan: 'pass-90', recipient: 'nobody-here' }),
    )
    expect((response as { to: string }).to).toContain('error=unknown-recipient')
    expect(stripe.sessions.size).toBe(0)
  })

  it('an auto plan cannot be a gift', async () => {
    const response = await handleCheckout(
      services(),
      request(alice, { plan: 'supporter-month', recipient: 'bob' }),
    )
    expect((response as { to: string }).to).toContain('error=gift-not-allowed')
  })

  it('naming yourself is just a purchase', async () => {
    const { sessionId } = await checkout(alice, 'pass-90', 'alice')
    await handleWebhook(services(), paidSessionEvent(sessionId))
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)
    expect((await recentLedger(context.data))[0]?.note).toBeNull()
  })
})

describe('subscriptions', () => {
  async function subscribe(): Promise<{ orderId: number; sessionId: string }> {
    const bought = await checkout(alice, 'supporter-month')
    await handleWebhook(
      services(),
      paidSessionEvent(bought.sessionId, { amount_total: 500, subscription: 'sub_1' }),
    )
    return bought
  }

  it('settles with the subscription attached, and refuses a second one', async () => {
    await subscribe()
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)

    const live = await liveMembership(context.data, alice, 'supporters')
    expect(live).toMatchObject({ renewalMode: 'auto', stripeSubscriptionId: 'sub_1' })

    const again = await handleCheckout(services(), request(alice, { plan: 'supporter-month' }))
    expect((again as { to: string }).to).toContain('error=already-member')
  })

  it('a renewal invoice extends; the first invoice does not double-count', async () => {
    await subscribe()
    const [before] = await membershipsFor(context.data, alice)

    const creation = await handleWebhook(
      services(),
      webhookRequest('invoice.paid', {
        id: 'in_0',
        subscription: 'sub_1',
        billing_reason: 'subscription_create',
        amount_paid: 500,
        currency: 'gbp',
        lines: { data: [] },
      }),
    )
    expect((creation as { body: { outcome: string } }).body.outcome).toBe('covered-by-checkout')
    expect(await recentLedger(context.data)).toHaveLength(1)

    const nextEnd = Math.floor(before!.currentPeriodEnd.getTime() / 1000) + 30 * 86_400
    const renewal = await handleWebhook(
      services(),
      webhookRequest('invoice.paid', {
        id: 'in_1',
        subscription: 'sub_1',
        billing_reason: 'subscription_cycle',
        amount_paid: 500,
        currency: 'gbp',
        lines: { data: [{ period: { end: nextEnd } }] },
      }),
    )
    expect((renewal as { body: { outcome: string } }).body.outcome).toBe('renewed')

    const [after] = await membershipsFor(context.data, alice)
    expect(after!.currentPeriodEnd).toEqual(new Date(nextEnd * 1000))
    expect(await recentLedger(context.data)).toHaveLength(2)
  })

  it('a failed renewal moves to grace and access survives the grace window only', async () => {
    await subscribe()
    await handleWebhook(
      services(),
      webhookRequest('invoice.payment_failed', { id: 'in_2', subscription: 'sub_1' }),
    )

    const live = await liveMembership(context.data, alice, 'supporters')
    expect(live?.status).toBe('grace')
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)
  })

  it('cancel keeps the paid period: closing, not gone', async () => {
    await subscribe()
    const live = await liveMembership(context.data, alice, 'supporters')

    const response = await handleCancel(
      services(),
      request(alice, { membership: String(live!.id) }, { path: 'cancel' }),
    )
    expect((response as { to: string }).to).toContain('cancelled=1')
    expect(stripe.cancelCalls).toEqual(['sub_1:true'])

    expect((await liveMembership(context.data, alice, 'supporters'))?.status).toBe('closing')
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)

    const stranger = await handleCancel(
      services(),
      request(bob, { membership: String(live!.id) }, { path: 'cancel' }),
    )
    expect((stranger as { to: string }).to).toContain('error=cancel-failed')
  })

  it('a refund revokes on the spot', async () => {
    const { sessionId } = await checkout(alice, 'pass-90')
    await handleWebhook(services(), paidSessionEvent(sessionId))
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)

    const response = await handleWebhook(
      services(),
      webhookRequest('charge.refunded', {
        id: 'ch_1',
        payment_intent: `pi_for_${sessionId}`,
        amount_refunded: 1200,
        currency: 'gbp',
      }),
    )
    expect((response as { body: { outcome: string } }).body.outcome).toBe('revoked-refund')

    expect((await actorGroups(alice)).has(supportersGroup)).toBe(false)
    const ledger = await recentLedger(context.data)
    expect(ledger[0]).toMatchObject({ kind: 'refund', amountMinor: -1200 })
  })
})

describe('the safety net', () => {
  it('reconcile settles an order whose webhook never came', async () => {
    const { orderId, sessionId } = await checkout(alice, 'pass-90')
    await exec(
      `update plugin_dues_order set created_at = now() - interval '20 minutes' where id = ${orderId}`,
    )
    stripe.sessions.set(sessionId, {
      ...stripe.sessions.get(sessionId)!,
      status: 'complete',
      paymentStatus: 'paid',
      amountTotal: 1200,
      currency: 'gbp',
      paymentIntentId: 'pi_reconciled',
    })

    const result = await runReconcile(entitlementDeps(services()), stripe)
    expect(result.ordersSettled).toBe(1)
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)
    expect((await orderById(context.data, orderId))?.status).toBe('paid')
  })

  it('reconcile replays a stored event that failed first time', async () => {
    const { sessionId } = await checkout(alice, 'pass-90')

    const raw = webhookRequest('checkout.session.completed', {
      id: sessionId,
      payment_status: 'paid',
      amount_total: 1200,
      currency: 'gbp',
      payment_intent: 'pi_x',
    })
    const payload = JSON.parse(new TextDecoder().decode(raw.rawBody!)) as {
      id: string
      type: string
    }
    await recordEvent(context.data, {
      stripeEventId: payload.id,
      type: payload.type,
      payload: JSON.parse(new TextDecoder().decode(raw.rawBody!)),
    })
    expect(await unprocessedEvents(context.data, 10)).toHaveLength(1)

    const result = await runReconcile(entitlementDeps(services()), stripe)
    expect(result.eventsReplayed).toBe(1)
    expect(await unprocessedEvents(context.data, 10)).toHaveLength(0)
    expect((await actorGroups(alice)).has(supportersGroup)).toBe(true)
  })

  it('an expired checkout closes the order and the sweep expires a lapsed membership', async () => {
    const { orderId, sessionId } = await checkout(alice, 'pass-90')
    await handleWebhook(
      services(),
      webhookRequest('checkout.session.expired', { id: sessionId }),
    )
    expect((await orderById(context.data, orderId))?.status).toBe('cancelled')

    const second = await checkout(bob, 'pass-90')
    await handleWebhook(services(), paidSessionEvent(second.sessionId))
    await exec(
      `update plugin_dues_membership
          set current_period_end = now() - interval '10 days',
              grace_until = now() - interval '3 days'
        where user_id = ${bob}`,
    )
    await exec(`update user_group_memberships set expires_at = now() - interval '3 days'`)

    expect((await actorGroups(bob)).has(supportersGroup)).toBe(false)
    expect(await runSweep(entitlementDeps(services()))).toBe(1)
    expect(await expireTimedGroupMemberships(h.db, 100)).toBe(1)

    const memberships = await membershipsFor(context.data, bob)
    expect(memberships[0]?.status).toBe('expired')
  })

  it('a webhook with a broken signature never reaches the tables', async () => {
    const { sessionId } = await checkout(alice, 'pass-90')
    const good = paidSessionEvent(sessionId)
    const bad = { ...good, headers: { 'stripe-signature': 't=1,v1=' + '0'.repeat(64) } }

    const response = await handleWebhook(services(), bad)
    expect(response).toMatchObject({ kind: 'json', status: 400 })
    expect(await unprocessedEvents(context.data, 10)).toHaveLength(0)
    expect(await membershipsFor(context.data, alice)).toHaveLength(0)
  })
})
