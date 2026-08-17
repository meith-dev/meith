import { applyInternalEvent, type EntitlementDeps, settlePaidOrder } from './entitlement'
import { addDays } from './period'
import { clampGrantUntil, TOP_UP_WHEN_WITHIN_DAYS } from './plans'
import {
  expireDueMemberships,
  extendMembership,
  longLiveMemberships,
  markEventFailed,
  markEventProcessed,
  membershipsPastPeriod,
  pendingOrdersOlderThan,
  setMembershipStatus,
  settleOrder,
  unprocessedEvents,
} from './store'
import type { StripeClient } from './stripe/client'
import { parseEventEnvelope, toInternalEvent } from './stripe/events'

const PENDING_AFTER_MINUTES = 15
const BATCH = 50

export interface ReconcileResult {
  readonly eventsReplayed: number
  readonly ordersSettled: number
  readonly ordersClosed: number
  readonly subscriptionsCorrected: number
}

export async function runReconcile(
  deps: EntitlementDeps,
  stripe: StripeClient | null,
): Promise<ReconcileResult> {
  let eventsReplayed = 0
  let ordersSettled = 0
  let ordersClosed = 0
  let subscriptionsCorrected = 0

  for (const event of await unprocessedEvents(deps.data, BATCH)) {
    const envelope = parseEventEnvelope(event.payload)
    if (envelope === null) {
      await markEventProcessed(deps.data, event.id, 'unparseable')
      continue
    }
    try {
      const outcome = await applyInternalEvent(deps, toInternalEvent(envelope))
      await markEventProcessed(deps.data, event.id, outcome)
      eventsReplayed += 1
    } catch (error) {
      await markEventFailed(
        deps.data,
        event.id,
        `failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (stripe === null) {
    return { eventsReplayed, ordersSettled, ordersClosed, subscriptionsCorrected }
  }

  for (const order of await pendingOrdersOlderThan(deps.data, PENDING_AFTER_MINUTES, BATCH)) {
    if (order.stripeSessionId === null) {
      await settleOrder(deps.data, order.id, { status: 'cancelled' })
      ordersClosed += 1
      continue
    }

    const session = await stripe.getCheckoutSession(order.stripeSessionId)
    if (session.status === 'complete' && session.paymentStatus !== 'unpaid') {
      await settlePaidOrder(deps, order, {
        amountTotal: session.amountTotal,
        currency: session.currency,
        subscriptionId: session.subscriptionId,
        paymentIntentId: session.paymentIntentId,
      })
      ordersSettled += 1
    } else if (session.status === 'expired') {
      await settleOrder(deps.data, order.id, { status: 'cancelled' })
      ordersClosed += 1
    }
  }

  for (const membership of await membershipsPastPeriod(deps.data, BATCH)) {
    if (membership.stripeSubscriptionId === null) continue
    const subscription = await stripe.getSubscription(membership.stripeSubscriptionId)

    if (
      subscription.status === 'active' &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd > membership.currentPeriodEnd
    ) {
      const graceUntil = addDays(subscription.currentPeriodEnd, deps.config.graceDays)
      await extendMembership(deps.data, membership.id, {
        currentPeriodEnd: subscription.currentPeriodEnd,
        graceUntil,
      })
      try {
        await deps.grants.grant({
          userId: membership.userId,
          groupKey: membership.groupKey,
          until: graceUntil,
          reason: `dues reconcile of subscription ${membership.stripeSubscriptionId}`,
        })
      } catch (error) {
        deps.log('dues: reconcile grant refused', {
          membershipId: membership.id,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
      subscriptionsCorrected += 1
    } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
      await setMembershipStatus(deps.data, membership.id, 'grace')
      subscriptionsCorrected += 1
    } else if (subscription.status === 'canceled') {
      await setMembershipStatus(deps.data, membership.id, 'closing')
      subscriptionsCorrected += 1
    }
  }

  return { eventsReplayed, ordersSettled, ordersClosed, subscriptionsCorrected }
}

export async function runSweep(deps: EntitlementDeps): Promise<number> {
  const expired = await expireDueMemberships(deps.data, 200)
  await topUpLongGrants(deps)
  return expired
}

async function topUpLongGrants(deps: EntitlementDeps): Promise<void> {
  const now = deps.now()
  const horizon = addDays(now, TOP_UP_WHEN_WITHIN_DAYS)

  for (const membership of await longLiveMemberships(deps.data, horizon, 200)) {
    const target = clampGrantUntil(membership.graceUntil, now)

    const grants = await deps.grants.list(membership.userId)
    const current = grants.find((grant) => grant.groupKey === membership.groupKey)
    if (current !== undefined && (current.expiresAt >= target || current.expiresAt > horizon)) {
      continue
    }

    try {
      await deps.grants.grant({
        userId: membership.userId,
        groupKey: membership.groupKey,
        until: target,
        reason: `dues grant window top-up for membership ${membership.id}`,
      })
    } catch (error) {
      deps.log('dues: grant top-up refused', {
        membershipId: membership.id,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
