import type { PluginData, PluginGrants, PluginNotify } from '@meith/plugin-kit'

import { discountedPrice } from './codes'
import { parseDuesConfig, type DuesConfig } from './config'
import { applyInternalEvent, settlePaidOrder, type EntitlementDeps } from './entitlement'
import { addDays } from './period'
import {
  attachCheckoutSession,
  insertCode,
  insertOrder,
  insertPlan,
  markEventProcessed,
  planRowByKey,
  recordEvent,
  setCodeDisabled,
  setPlanArchived,
  settleOrder,
  type CodeRow,
  type NewPlan,
  type OrderRow,
  type PlanRow,
} from './store'
import { toInternalEvent, type StripeEventEnvelope } from './stripe/events'

export const DUES_DEMO_GROUP = 'supporters'

export const DUES_DEMO_CURRENCY = 'gbp'
export const DUES_DEMO_GRACE_DAYS = 7

export const DUES_DEMO_PLANS = {
  month: 'supporter-month',
  pass: 'pass-90',
  lifetime: 'lifetime',
  founder: 'founder',
} as const

export const DUES_DEMO_CODES = {
  comp: 'COMP-LIFETIME',
  thanks: 'THANKS-2026',
  early: 'EARLY-BIRD',
} as const

export const DUES_DEMO_PRICES: readonly {
  readonly id: string
  readonly name: string
  readonly unitAmount: number
  readonly currency: string
  readonly interval: 'month' | 'year'
}[] = [
  {
    id: 'price_demo_supporter_month',
    name: 'Supporter',
    unitAmount: 500,
    currency: DUES_DEMO_CURRENCY,
    interval: 'month',
  },
]

export interface DuesDemoCast {
  readonly comped: number
  readonly founder: number
  readonly subscriber: number
  readonly passHolder: number
  readonly lapsing: number
  readonly leaving: number
  readonly refunded: number
  readonly gifter: number
  readonly gifted: number
  readonly staff: number
}

export interface DuesDemoDeps {
  readonly data: PluginData
  readonly grants: (now: () => Date) => PluginGrants
  readonly notify?: PluginNotify | undefined
  readonly cast: DuesDemoCast
  readonly now: Date
  readonly log?: ((message: string, detail?: Record<string, unknown>) => void) | undefined
}

export interface DuesDemoSummary {
  readonly plans: number
  readonly codes: number
  readonly orders: number
  readonly memberships: number
  readonly events: number
}

export async function seedDuesDemo(deps: DuesDemoDeps): Promise<DuesDemoSummary> {
  return new DemoSeed(deps).run()
}

const NO_OP_NOTIFY: PluginNotify = { send: async () => {} }

const PASS_PRICE = 1200
const MONTH_PRICE = 500

class DemoSeed {
  private readonly config: DuesConfig
  private readonly grants: PluginGrants
  private clock: Date
  private eventCounter = 0
  private counts = { plans: 0, codes: 0, orders: 0, memberships: 0, events: 0 }

  constructor(private readonly deps: DuesDemoDeps) {
    this.config = parseDuesConfig({
      currency: DUES_DEMO_CURRENCY,
      graceDays: DUES_DEMO_GRACE_DAYS,
    })
    this.clock = deps.now
    this.grants = deps.grants(() => this.clock)
  }

  async run(): Promise<DuesDemoSummary> {
    await this.plans()
    const comp = await this.codes()

    await this.at(300, () => this.buyFounderPass())
    await this.at(180, () => this.compLifetime(comp))

    await this.subscription({
      member: this.deps.cast.subscriber,
      subscriptionId: 'sub_demo_supporter',
      boughtDaysAgo: 158,
      renewedDaysAgo: [128, 97, 66, 35, 4],
    })
    await this.subscription({
      member: this.deps.cast.lapsing,
      subscriptionId: 'sub_demo_lapsed',
      boughtDaysAgo: 126,
      renewedDaysAgo: [96, 65, 34],
      failedDaysAgo: 1,
    })
    await this.subscription({
      member: this.deps.cast.leaving,
      subscriptionId: 'sub_demo_leaving',
      boughtDaysAgo: 95,
      renewedDaysAgo: [65, 34, 3],
      cancelledDaysAgo: 2,
    })

    await this.at(40, () => this.buyPass(this.deps.cast.passHolder))
    await this.at(26, () => this.buyPass(this.deps.cast.refunded))
    await this.at(19, () => this.refund(this.deps.cast.refunded))
    await this.at(12, () => this.gift())
    await this.at(8, () => this.abandonedCheckout())

    return { ...this.counts }
  }

  private async plans(): Promise<void> {
    await this.plan({
      planKey: DUES_DEMO_PLANS.month,
      name: 'Supporter',
      description: 'The board’s bills, split honestly. Renews monthly; cancel whenever you like.',
      groupKey: DUES_DEMO_GROUP,
      priceMinor: MONTH_PRICE,
      currency: DUES_DEMO_CURRENCY,
      mode: 'auto',
      periodSpec: null,
      billingInterval: 'month',
      stripePriceId: DUES_DEMO_PRICES[0]!.id,
      giftable: false,
      hidden: false,
    })

    await this.plan({
      planKey: DUES_DEMO_PLANS.pass,
      name: '90-day pass',
      description:
        'Three months among the supporters, paid once. Buy it for yourself or for somebody else.',
      groupKey: DUES_DEMO_GROUP,
      priceMinor: PASS_PRICE,
      currency: DUES_DEMO_CURRENCY,
      mode: 'fixed',
      periodSpec: 'P90D',
      billingInterval: null,
      giftable: true,
      hidden: false,
    })

    await this.plan({
      planKey: DUES_DEMO_PLANS.lifetime,
      name: 'Lifetime membership',
      description: 'Once, and never again. No renewal, no end date.',
      groupKey: DUES_DEMO_GROUP,
      priceMinor: 9900,
      currency: DUES_DEMO_CURRENCY,
      mode: 'lifetime',
      periodSpec: null,
      billingInterval: null,
      giftable: true,
      hidden: false,
    })

    const founder = await this.plan({
      planKey: DUES_DEMO_PLANS.founder,
      name: 'Founding supporter',
      description: 'A year at the old price, sold before the plans settled. Not on sale now.',
      groupKey: DUES_DEMO_GROUP,
      priceMinor: 2500,
      currency: DUES_DEMO_CURRENCY,
      mode: 'fixed',
      periodSpec: 'P1Y',
      billingInterval: null,
      giftable: false,
      hidden: false,
    })
    if (founder !== null) await setPlanArchived(this.deps.data, founder.id, true)
  }

  private async plan(input: NewPlan): Promise<PlanRow | null> {
    const row = await insertPlan(this.deps.data, input)
    if (row !== null) this.counts.plans += 1
    return row
  }

  private async codes(): Promise<CodeRow> {
    const comp = await this.code({
      code: DUES_DEMO_CODES.comp,
      percentOff: 100,
      planKey: DUES_DEMO_PLANS.lifetime,
      maxRedemptions: 5,
      expiresAt: null,
      createdByUserId: this.deps.cast.staff,
    })
    if (comp === null) {
      throw new Error('the demo comp code could not be minted into an empty code table')
    }

    await this.code({
      code: DUES_DEMO_CODES.thanks,
      percentOff: 25,
      planKey: null,
      maxRedemptions: null,
      expiresAt: addDays(this.deps.now, 60),
      createdByUserId: this.deps.cast.staff,
    })

    const early = await this.code({
      code: DUES_DEMO_CODES.early,
      percentOff: 50,
      planKey: DUES_DEMO_PLANS.pass,
      maxRedemptions: 25,
      expiresAt: addDays(this.deps.now, -30),
      createdByUserId: this.deps.cast.staff,
    })
    if (early !== null) await setCodeDisabled(this.deps.data, early.id, true)

    return comp
  }

  private async code(input: Parameters<typeof insertCode>[1]): Promise<CodeRow | null> {
    const row = await insertCode(this.deps.data, input)
    if (row !== null) this.counts.codes += 1
    return row
  }

  private async buyFounderPass(): Promise<void> {
    const order = await this.order({
      buyer: this.deps.cast.founder,
      planKey: DUES_DEMO_PLANS.founder,
      sessionId: 'cs_demo_founder',
    })
    await this.settle(order, 'cs_demo_founder', { paymentIntentId: 'pi_demo_founder' })
  }

  private async compLifetime(code: CodeRow): Promise<void> {
    const order = await this.order({
      buyer: this.deps.cast.comped,
      planKey: DUES_DEMO_PLANS.lifetime,
      sessionId: null,
      code,
    })

    await settlePaidOrder(this.entitlement(), order, {
      amountTotal: 0,
      currency: DUES_DEMO_CURRENCY,
      subscriptionId: null,
      paymentIntentId: null,
    })
    this.counts.memberships += 1
  }

  private async buyPass(buyer: number): Promise<void> {
    const sessionId = `cs_demo_pass_${buyer}`
    const order = await this.order({ buyer, planKey: DUES_DEMO_PLANS.pass, sessionId })
    await this.settle(order, sessionId, { paymentIntentId: paymentIntentFor(buyer) })
  }

  private async gift(): Promise<void> {
    const order = await this.order({
      buyer: this.deps.cast.gifter,
      recipient: this.deps.cast.gifted,
      planKey: DUES_DEMO_PLANS.pass,
      sessionId: 'cs_demo_gift',
    })
    await this.settle(order, 'cs_demo_gift', { paymentIntentId: 'pi_demo_gift' })
  }

  private async refund(buyer: number): Promise<void> {
    await this.event('charge.refunded', {
      id: `ch_demo_refund_${buyer}`,
      payment_intent: paymentIntentFor(buyer),
      amount_refunded: PASS_PRICE,
      currency: DUES_DEMO_CURRENCY,
    })
  }

  private async abandonedCheckout(): Promise<void> {
    const order = await this.order({
      buyer: this.deps.cast.gifter,
      planKey: DUES_DEMO_PLANS.lifetime,
      sessionId: 'cs_demo_abandoned',
    })
    await settleOrder(this.deps.data, order.id, { status: 'cancelled' })
  }

  private async subscription(input: {
    readonly member: number
    readonly subscriptionId: string
    readonly boughtDaysAgo: number
    readonly renewedDaysAgo: readonly number[]
    readonly failedDaysAgo?: number
    readonly cancelledDaysAgo?: number
  }): Promise<void> {
    const sessionId = `cs_${input.subscriptionId}`

    await this.at(input.boughtDaysAgo, async () => {
      const order = await this.order({
        buyer: input.member,
        planKey: DUES_DEMO_PLANS.month,
        sessionId,
      })
      await this.settle(order, sessionId, { subscriptionId: input.subscriptionId })
    })

    for (const daysAgo of input.renewedDaysAgo) {
      await this.at(daysAgo, () =>
        this.event('invoice.paid', {
          id: `in_${input.subscriptionId}_${daysAgo}`,
          subscription: input.subscriptionId,
          amount_paid: MONTH_PRICE,
          currency: DUES_DEMO_CURRENCY,
          billing_reason: 'subscription_cycle',
          period_end: unix(addDays(this.clock, 31)),
        }),
      )
    }

    if (input.failedDaysAgo !== undefined) {
      await this.at(input.failedDaysAgo, () =>
        this.event('invoice.payment_failed', {
          id: `in_${input.subscriptionId}_failed`,
          subscription: input.subscriptionId,
        }),
      )
    }

    if (input.cancelledDaysAgo !== undefined) {
      await this.at(input.cancelledDaysAgo, () =>
        this.event('customer.subscription.updated', {
          id: input.subscriptionId,
          status: 'active',
          cancel_at_period_end: true,
        }),
      )
    }
  }

  private async order(input: {
    readonly buyer: number
    readonly recipient?: number
    readonly planKey: string
    readonly sessionId: string | null
    readonly code?: CodeRow
  }): Promise<OrderRow> {
    const plan = await planRowByKey(this.deps.data, input.planKey)
    if (plan === null) {
      throw new Error(`the demo names a dues plan "${input.planKey}" that it never made`)
    }

    const charge =
      input.code === undefined
        ? plan.priceMinor
        : discountedPrice(plan.priceMinor, input.code.percentOff)

    const { order } = await insertOrder(this.deps.data, {
      buyerUserId: input.buyer,
      recipientUserId: input.recipient ?? input.buyer,
      planKey: plan.key,
      planName: plan.name,
      groupKey: plan.groupKey,
      amountMinor: charge,
      currency: plan.currency,
      billingMode: plan.mode,
      periodSpec: plan.mode === 'fixed' ? plan.periodSpec : null,
      idempotencyKey: `demo:${plan.key}:${input.buyer}:${this.clock.toISOString()}`,
      codeId: input.code?.id ?? null,
      discountMinor: plan.priceMinor - charge,
    })
    this.counts.orders += 1

    if (input.sessionId !== null) {
      await attachCheckoutSession(this.deps.data, order.id, { id: input.sessionId, url: null })
    }

    return order
  }

  private async settle(
    order: OrderRow,
    sessionId: string,
    stripe: { readonly subscriptionId?: string; readonly paymentIntentId?: string },
  ): Promise<void> {
    await this.event('checkout.session.completed', {
      id: sessionId,
      object: 'checkout.session',
      payment_status: 'paid',
      amount_total: order.amountMinor,
      currency: order.currency,
      subscription: stripe.subscriptionId ?? null,
      payment_intent: stripe.paymentIntentId ?? null,
      customer: `cus_demo_${order.buyerUserId}`,
    })
    this.counts.memberships += 1
  }

  private async event(type: string, object: Record<string, unknown>): Promise<void> {
    this.eventCounter += 1
    const envelope: StripeEventEnvelope = { id: `evt_demo_${this.eventCounter}`, type, object }

    const recorded = await recordEvent(this.deps.data, {
      stripeEventId: envelope.id,
      type: envelope.type,
      payload: { id: envelope.id, type: envelope.type, data: { object } },
    })
    this.counts.events += 1

    const outcome = await applyInternalEvent(this.entitlement(), toInternalEvent(envelope))
    await markEventProcessed(this.deps.data, recorded.id, outcome)
  }

  private entitlement(): EntitlementDeps {
    return {
      config: this.config,
      data: this.deps.data,
      grants: this.grants,
      notify: this.deps.notify ?? NO_OP_NOTIFY,
      log: this.deps.log ?? (() => {}),
      now: () => this.clock,
    }
  }

  private async at(daysAgo: number, work: () => Promise<void>): Promise<void> {
    const marks = await this.highWaterMarks()
    this.clock = addDays(this.deps.now, -daysAgo)
    await work()
    await this.backdate(this.clock, marks)
    this.clock = this.deps.now
  }

  private async highWaterMarks(): Promise<Marks> {
    const row = await this.deps.data.one(`
      select
        (select coalesce(max(id), 0) from plugin_dues_order)::int      as orders,
        (select coalesce(max(id), 0) from plugin_dues_membership)::int as memberships,
        (select coalesce(max(id), 0) from plugin_dues_ledger)::int     as ledger,
        (select coalesce(max(id), 0) from plugin_dues_event)::int      as events
    `)
    return {
      orders: Number(row?.orders ?? 0),
      memberships: Number(row?.memberships ?? 0),
      ledger: Number(row?.ledger ?? 0),
      events: Number(row?.events ?? 0),
    }
  }

  private async backdate(at: Date, marks: Marks): Promise<void> {
    await this.deps.data.query(
      `update plugin_dues_order
          set created_at = $1::timestamptz,
              settled_at = case when settled_at is null then null else $1::timestamptz end
        where id > $2`,
      [at, marks.orders],
    )
    await this.deps.data.query(
      `update plugin_dues_membership
          set created_at = $1::timestamptz, updated_at = $1::timestamptz
        where id > $2`,
      [at, marks.memberships],
    )
    await this.deps.data.query(
      `update plugin_dues_membership
          set updated_at = $1::timestamptz
        where id <= $2 and updated_at > $1::timestamptz`,
      [at, marks.memberships],
    )
    await this.deps.data.query(
      `update plugin_dues_ledger set occurred_at = $1::timestamptz where id > $2`,
      [at, marks.ledger],
    )
    await this.deps.data.query(
      `update plugin_dues_event
          set received_at = $1::timestamptz,
              processed_at = case when processed_at is null then null else $1::timestamptz end
        where id > $2`,
      [at, marks.events],
    )
  }
}

interface Marks {
  readonly orders: number
  readonly memberships: number
  readonly ledger: number
  readonly events: number
}

function paymentIntentFor(buyer: number): string {
  return `pi_demo_pass_${buyer}`
}

function unix(at: Date): number {
  return Math.floor(at.getTime() / 1000)
}
