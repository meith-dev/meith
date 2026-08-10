import type { PluginGrants, PluginData } from '@meith/plugin-kit'

import type { DuesConfig, DuesPlan } from './config'
import { moneyMatches } from './money'
import { addBillingInterval, addDays, addPeriod } from './period'
import {
  extendMembership,
  flagMembership,
  insertLedger,
  insertMembership,
  liveMembership,
  membershipBySubscription,
  orderByPaymentIntent,
  orderBySessionId,
  setMembershipStatus,
  settleOrder,
  type MembershipRow,
  type OrderRow,
} from './store'
import type { InternalEvent } from './stripe/events'

export interface EntitlementDeps {
  readonly config: DuesConfig
  readonly data: PluginData
  readonly grants: PluginGrants
  readonly log: (message: string, detail?: Record<string, unknown>) => void
  readonly now: () => Date
}

function grantReason(order: OrderRow): string {
  const gift =
    order.buyerUserId === order.recipientUserId
      ? ''
      : `, a gift from user ${order.buyerUserId}`
  return `dues order ${order.id}: ${order.planName}${gift}`
}

export interface SettlementInfo {
  readonly amountTotal: number | null
  readonly currency: string | null
  readonly subscriptionId: string | null
  readonly paymentIntentId: string | null
}

export async function settlePaidOrder(
  deps: EntitlementDeps,
  order: OrderRow,
  info: SettlementInfo,
): Promise<string> {
  if (order.status === 'paid') return 'already-settled'
  if (order.status === 'failed' || order.status === 'cancelled') return `order-${order.status}`

  if (!moneyMatches({ amountMinor: order.amountMinor, currency: order.currency }, {
    amountMinor: info.amountTotal,
    currency: info.currency,
  })) {
    await settleOrder(deps.data, order.id, {
      status: 'pending',
      needsAttention:
        `paid ${String(info.amountTotal)} ${String(info.currency)} against an order for ` +
        `${order.amountMinor} ${order.currency}`,
    })
    deps.log('dues: settlement amount mismatch', { orderId: order.id })
    return 'amount-mismatch'
  }

  const plan = deps.config.plans.find((candidate) => candidate.key === order.planKey)
  const now = deps.now()
  const existing = await liveMembership(deps.data, order.recipientUserId, order.groupKey)

  const periodEnd = settledPeriodEnd(order, plan ?? null, existing, now)
  const graceUntil = addDays(periodEnd, deps.config.graceDays)

  let membership: MembershipRow
  if (existing === null) {
    membership = await insertMembership(deps.data, {
      userId: order.recipientUserId,
      groupKey: order.groupKey,
      planKey: order.planKey,
      renewalMode: order.billingMode,
      currentPeriodEnd: periodEnd,
      graceUntil,
      stripeSubscriptionId: info.subscriptionId,
      lastOrderId: order.id,
    })
  } else {
    await extendMembership(deps.data, existing.id, {
      currentPeriodEnd: periodEnd,
      graceUntil,
      planKey: order.planKey,
      lastOrderId: order.id,
      stripeSubscriptionId: info.subscriptionId,
    })
    membership = existing
  }

  let outcome = 'granted'
  try {
    await deps.grants.grant({
      userId: order.recipientUserId,
      groupKey: order.groupKey,
      until: graceUntil,
      reason: grantReason(order),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await flagMembership(deps.data, membership.id, `grant refused: ${reason}`)
    deps.log('dues: grant refused after payment', { orderId: order.id, reason })
    outcome = 'paid-but-grant-refused'
  }

  await insertLedger(deps.data, {
    kind: 'charge',
    userId: order.buyerUserId,
    membershipId: membership.id,
    orderId: order.id,
    amountMinor: order.amountMinor,
    currency: order.currency,
    stripeRef: info.paymentIntentId ?? info.subscriptionId,
    note:
      order.buyerUserId === order.recipientUserId
        ? null
        : `gift for user ${order.recipientUserId}`,
  })

  await settleOrder(deps.data, order.id, {
    status: 'paid',
    stripeSubscriptionId: info.subscriptionId,
    stripePaymentIntentId: info.paymentIntentId,
  })

  return outcome
}

function settledPeriodEnd(
  order: OrderRow,
  plan: DuesPlan | null,
  existing: MembershipRow | null,
  now: Date,
): Date {
  if (order.billingMode === 'fixed') {
    const base = existing !== null && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now
    const parsed =
      plan !== null && plan.billing.mode === 'fixed'
        ? plan.billing.parsed
        : parseStoredPeriod(order)
    return addPeriod(base, parsed)
  }

  const interval =
    plan !== null && plan.billing.mode === 'auto' ? plan.billing.interval : 'month'
  return addBillingInterval(now, interval)
}

function parseStoredPeriod(order: OrderRow) {
  const fallback = { years: 0, months: 0, weeks: 0, days: 30 }
  if (order.periodSpec === null) return fallback
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(order.periodSpec)
  if (match === null) return fallback
  return {
    years: Number(match[1] ?? 0),
    months: Number(match[2] ?? 0),
    weeks: Number(match[3] ?? 0),
    days: Number(match[4] ?? 0),
  }
}

export async function applyInternalEvent(
  deps: EntitlementDeps,
  event: InternalEvent,
): Promise<string> {
  switch (event.kind) {
    case 'checkout-settled': {
      const order = await orderBySessionId(deps.data, event.sessionId)
      if (order === null) return 'unmatched-session'
      if (!event.paid) return 'awaiting-async-payment'
      return settlePaidOrder(deps, order, event)
    }

    case 'checkout-failed': {
      const order = await orderBySessionId(deps.data, event.sessionId)
      if (order === null) return 'unmatched-session'
      if (order.status === 'paid') return 'already-settled'
      await settleOrder(deps.data, order.id, { status: 'failed' })
      return 'order-failed'
    }

    case 'checkout-expired': {
      const order = await orderBySessionId(deps.data, event.sessionId)
      if (order === null) return 'unmatched-session'
      if (order.status !== 'created' && order.status !== 'pending') return 'already-settled'
      await settleOrder(deps.data, order.id, { status: 'cancelled' })
      return 'order-expired'
    }

    case 'invoice-paid': {
      if (event.subscriptionId === null) return 'no-subscription'
      const membership = await membershipBySubscription(deps.data, event.subscriptionId)
      if (membership === null) {
        return 'no-membership-yet'
      }
      if (event.billingReason === 'subscription_create') return 'covered-by-checkout'

      const periodEnd =
        event.periodEnd ?? addBillingInterval(membership.currentPeriodEnd, 'month')
      const graceUntil = addDays(periodEnd, deps.config.graceDays)

      await extendMembership(deps.data, membership.id, {
        currentPeriodEnd: periodEnd,
        graceUntil,
      })

      let outcome = 'renewed'
      try {
        await deps.grants.grant({
          userId: membership.userId,
          groupKey: membership.groupKey,
          until: graceUntil,
          reason: `dues renewal of subscription ${event.subscriptionId}`,
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        await flagMembership(deps.data, membership.id, `renewal grant refused: ${reason}`)
        deps.log('dues: renewal grant refused', { membershipId: membership.id, reason })
        outcome = 'renewed-but-grant-refused'
      }

      await insertLedger(deps.data, {
        kind: 'charge',
        userId: membership.userId,
        membershipId: membership.id,
        orderId: membership.lastOrderId,
        amountMinor: event.amountPaid,
        currency: event.currency ?? deps.config.currency,
        stripeRef: event.subscriptionId,
        note: 'renewal',
      })
      return outcome
    }

    case 'invoice-failed': {
      if (event.subscriptionId === null) return 'no-subscription'
      const membership = await membershipBySubscription(deps.data, event.subscriptionId)
      if (membership === null) return 'no-membership'
      if (membership.status === 'active') {
        await setMembershipStatus(deps.data, membership.id, 'grace')
      }
      return 'grace'
    }

    case 'subscription-updated': {
      const membership = await membershipBySubscription(deps.data, event.subscriptionId)
      if (membership === null) return 'no-membership'

      if (event.periodEnd !== null && membership.status !== 'revoked') {
        await extendMembership(deps.data, membership.id, {
          currentPeriodEnd: event.periodEnd,
          graceUntil: addDays(event.periodEnd, deps.config.graceDays),
        })
      }
      if (event.cancelAtPeriodEnd && membership.status !== 'revoked') {
        await setMembershipStatus(deps.data, membership.id, 'closing')
        return 'closing'
      }
      if (!event.cancelAtPeriodEnd && membership.status === 'closing') {
        await setMembershipStatus(deps.data, membership.id, 'active')
        return 'reopened'
      }
      return 'noted'
    }

    case 'subscription-deleted': {
      const membership = await membershipBySubscription(deps.data, event.subscriptionId)
      if (membership === null) return 'no-membership'
      if (membership.status === 'active' || membership.status === 'grace') {
        await setMembershipStatus(deps.data, membership.id, 'closing')
      }
      return 'closing'
    }

    case 'payment-reversed': {
      if (event.paymentIntentId === null) return 'unmatched-reversal'
      const order = await orderByPaymentIntent(deps.data, event.paymentIntentId)
      if (order === null) return 'unmatched-reversal'

      const membership = await liveMembership(
        deps.data,
        order.recipientUserId,
        order.groupKey,
      )
      if (membership !== null) {
        await setMembershipStatus(deps.data, membership.id, 'revoked')
        try {
          await deps.grants.revoke({
            userId: order.recipientUserId,
            groupKey: order.groupKey,
            reason: `dues ${event.reversal} on order ${order.id}`,
          })
        } catch (error) {
          deps.log('dues: revoke after reversal failed', {
            orderId: order.id,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }

      await insertLedger(deps.data, {
        kind: event.reversal,
        userId: order.buyerUserId,
        membershipId: membership?.id ?? null,
        orderId: order.id,
        amountMinor: -Math.abs(event.amountMinor),
        currency: event.currency ?? order.currency,
        stripeRef: event.stripeRef,
        note: event.reversal === 'chargeback' ? 'dispute opened' : null,
      })
      return `revoked-${event.reversal}`
    }

    case 'unhandled':
      return `ignored:${event.type}`
  }
}
