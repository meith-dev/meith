import type { PluginData } from '@meith/plugin-kit'

export type OrderStatus = 'created' | 'pending' | 'paid' | 'failed' | 'cancelled'
export type MembershipStatus = 'active' | 'grace' | 'closing' | 'expired' | 'revoked'
export type RenewalMode = 'auto' | 'fixed' | 'lifetime'
export type PlanMode = RenewalMode

export interface OrderRow {
  readonly id: number
  readonly buyerUserId: number
  readonly recipientUserId: number
  readonly planKey: string
  readonly planName: string
  readonly groupKey: string
  readonly amountMinor: number
  readonly currency: string
  readonly billingMode: RenewalMode
  readonly periodSpec: string | null
  readonly status: OrderStatus
  readonly needsAttention: string | null
  readonly codeId: number | null
  readonly discountMinor: number
  readonly stripeSessionId: string | null
  readonly stripeSubscriptionId: string | null
  readonly stripePaymentIntentId: string | null
  readonly checkoutUrl: string | null
  readonly createdAt: Date
  readonly settledAt: Date | null
}

export interface MembershipRow {
  readonly id: number
  readonly userId: number
  readonly groupKey: string
  readonly planKey: string
  readonly status: MembershipStatus
  readonly renewalMode: RenewalMode
  readonly currentPeriodEnd: Date
  readonly graceUntil: Date
  readonly needsAttention: string | null
  readonly stripeSubscriptionId: string | null
  readonly lastOrderId: number | null
}

export interface EventRow {
  readonly id: number
  readonly stripeEventId: string
  readonly type: string
  readonly payload: unknown
  readonly receivedAt: Date
  readonly processedAt: Date | null
  readonly outcome: string | null
}

export interface LedgerRow {
  readonly id: number
  readonly occurredAt: Date
  readonly kind: 'charge' | 'refund' | 'chargeback'
  readonly userId: number
  readonly membershipId: number | null
  readonly orderId: number | null
  readonly amountMinor: number
  readonly currency: string
  readonly stripeRef: string | null
  readonly note: string | null
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}

function asNullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : asDate(value)
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function orderRow(row: Record<string, unknown>): OrderRow {
  return {
    id: Number(row.id),
    buyerUserId: Number(row.buyer_user_id),
    recipientUserId: Number(row.recipient_user_id),
    planKey: String(row.plan_key),
    planName: String(row.plan_name),
    groupKey: String(row.group_key),
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency),
    billingMode: String(row.billing_mode) as RenewalMode,
    periodSpec: asNullableString(row.period_spec),
    status: String(row.status) as OrderStatus,
    needsAttention: asNullableString(row.needs_attention),
    codeId: row.code_id === null || row.code_id === undefined ? null : Number(row.code_id),
    discountMinor: Number(row.discount_minor ?? 0),
    stripeSessionId: asNullableString(row.stripe_session_id),
    stripeSubscriptionId: asNullableString(row.stripe_subscription_id),
    stripePaymentIntentId: asNullableString(row.stripe_payment_intent_id),
    checkoutUrl: asNullableString(row.checkout_url),
    createdAt: asDate(row.created_at),
    settledAt: asNullableDate(row.settled_at),
  }
}

function membershipRow(row: Record<string, unknown>): MembershipRow {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    groupKey: String(row.group_key),
    planKey: String(row.plan_key),
    status: String(row.status) as MembershipStatus,
    renewalMode: String(row.renewal_mode) as RenewalMode,
    currentPeriodEnd: asDate(row.current_period_end),
    graceUntil: asDate(row.grace_until),
    needsAttention: asNullableString(row.needs_attention),
    stripeSubscriptionId: asNullableString(row.stripe_subscription_id),
    lastOrderId:
      row.last_order_id === null || row.last_order_id === undefined
        ? null
        : Number(row.last_order_id),
  }
}

function eventRow(row: Record<string, unknown>): EventRow {
  return {
    id: Number(row.id),
    stripeEventId: String(row.stripe_event_id),
    type: String(row.type),
    payload: row.payload,
    receivedAt: asDate(row.received_at),
    processedAt: asNullableDate(row.processed_at),
    outcome: asNullableString(row.outcome),
  }
}

function ledgerRow(row: Record<string, unknown>): LedgerRow {
  return {
    id: Number(row.id),
    occurredAt: asDate(row.occurred_at),
    kind: String(row.kind) as LedgerRow['kind'],
    userId: Number(row.user_id),
    membershipId:
      row.membership_id === null || row.membership_id === undefined
        ? null
        : Number(row.membership_id),
    orderId: row.order_id === null || row.order_id === undefined ? null : Number(row.order_id),
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency),
    stripeRef: asNullableString(row.stripe_ref),
    note: asNullableString(row.note),
  }
}

export async function findStripeCustomer(data: PluginData, userId: number): Promise<string | null> {
  const row = await data.one(
    'select stripe_customer_id from plugin_dues_customer where user_id = $1',
    [userId],
  )
  return row === null ? null : String(row.stripe_customer_id)
}

export async function saveStripeCustomer(
  data: PluginData,
  userId: number,
  stripeCustomerId: string,
): Promise<void> {
  await data.query(
    `insert into plugin_dues_customer (user_id, stripe_customer_id)
     values ($1, $2)
     on conflict (user_id) do nothing`,
    [userId, stripeCustomerId],
  )
}

export interface NewOrder {
  readonly buyerUserId: number
  readonly recipientUserId: number
  readonly planKey: string
  readonly planName: string
  readonly groupKey: string
  readonly amountMinor: number
  readonly currency: string
  readonly billingMode: RenewalMode
  readonly periodSpec: string | null
  readonly idempotencyKey: string
  readonly codeId?: number | null
  readonly discountMinor?: number
}

export async function insertOrder(
  data: PluginData,
  order: NewOrder,
): Promise<{ readonly order: OrderRow; readonly created: boolean }> {
  const inserted = await data.one(
    `insert into plugin_dues_order
       (buyer_user_id, recipient_user_id, plan_key, plan_name, group_key,
        amount_minor, currency, billing_mode, period_spec, idempotency_key,
        code_id, discount_minor)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (idempotency_key) do nothing
     returning *`,
    [
      order.buyerUserId,
      order.recipientUserId,
      order.planKey,
      order.planName,
      order.groupKey,
      order.amountMinor,
      order.currency,
      order.billingMode,
      order.periodSpec,
      order.idempotencyKey,
      order.codeId ?? null,
      order.discountMinor ?? 0,
    ],
  )
  if (inserted !== null) return { order: orderRow(inserted), created: true }

  const existing = await data.one('select * from plugin_dues_order where idempotency_key = $1', [
    order.idempotencyKey,
  ])
  if (existing === null) throw new Error('order insert lost a race it cannot lose')
  return { order: orderRow(existing), created: false }
}

export async function attachCheckoutSession(
  data: PluginData,
  orderId: number,
  session: { readonly id: string; readonly url: string | null },
): Promise<void> {
  await data.query(
    `update plugin_dues_order
        set status = 'pending', stripe_session_id = $2, checkout_url = $3
      where id = $1 and status in ('created', 'pending')`,
    [orderId, session.id, session.url],
  )
}

export async function orderById(data: PluginData, id: number): Promise<OrderRow | null> {
  const row = await data.one('select * from plugin_dues_order where id = $1', [id])
  return row === null ? null : orderRow(row)
}

export async function orderBySessionId(
  data: PluginData,
  sessionId: string,
): Promise<OrderRow | null> {
  const row = await data.one('select * from plugin_dues_order where stripe_session_id = $1', [
    sessionId,
  ])
  return row === null ? null : orderRow(row)
}

export async function orderByPaymentIntent(
  data: PluginData,
  paymentIntentId: string,
): Promise<OrderRow | null> {
  const row = await data.one(
    'select * from plugin_dues_order where stripe_payment_intent_id = $1',
    [paymentIntentId],
  )
  return row === null ? null : orderRow(row)
}

export async function settleOrder(
  data: PluginData,
  orderId: number,
  outcome: {
    readonly status: OrderStatus
    readonly stripeSubscriptionId?: string | null
    readonly stripePaymentIntentId?: string | null
    readonly needsAttention?: string | null
  },
): Promise<void> {
  await data.query(
    `update plugin_dues_order
        set status = $2,
            settled_at = now(),
            stripe_subscription_id = coalesce($3, stripe_subscription_id),
            stripe_payment_intent_id = coalesce($4, stripe_payment_intent_id),
            needs_attention = $5
      where id = $1`,
    [
      orderId,
      outcome.status,
      outcome.stripeSubscriptionId ?? null,
      outcome.stripePaymentIntentId ?? null,
      outcome.needsAttention ?? null,
    ],
  )
}

export async function pendingOrdersOlderThan(
  data: PluginData,
  minutes: number,
  limit: number,
): Promise<readonly OrderRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_order
      where status in ('created', 'pending')
        and created_at < now() - ($1 * interval '1 minute')
      order by created_at
      limit $2`,
    [minutes, limit],
  )
  return rows.map(orderRow)
}

export async function ordersBoughtBy(
  data: PluginData,
  buyerUserId: number,
  limit = 20,
): Promise<readonly OrderRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_order
      where buyer_user_id = $1
      order by created_at desc
      limit $2`,
    [buyerUserId, limit],
  )
  return rows.map(orderRow)
}

export async function liveMembership(
  data: PluginData,
  userId: number,
  groupKey: string,
): Promise<MembershipRow | null> {
  const row = await data.one(
    `select * from plugin_dues_membership
      where user_id = $1 and group_key = $2 and status in ('active', 'grace', 'closing')`,
    [userId, groupKey],
  )
  return row === null ? null : membershipRow(row)
}

export async function membershipById(data: PluginData, id: number): Promise<MembershipRow | null> {
  const row = await data.one('select * from plugin_dues_membership where id = $1', [id])
  return row === null ? null : membershipRow(row)
}

export async function membershipBySubscription(
  data: PluginData,
  stripeSubscriptionId: string,
): Promise<MembershipRow | null> {
  const row = await data.one(
    `select * from plugin_dues_membership
      where stripe_subscription_id = $1
      order by created_at desc
      limit 1`,
    [stripeSubscriptionId],
  )
  return row === null ? null : membershipRow(row)
}

export async function membershipsFor(
  data: PluginData,
  userId: number,
): Promise<readonly MembershipRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_membership
      where user_id = $1
      order by status in ('active', 'grace', 'closing') desc, updated_at desc
      limit 50`,
    [userId],
  )
  return rows.map(membershipRow)
}

export interface NewMembership {
  readonly userId: number
  readonly groupKey: string
  readonly planKey: string
  readonly renewalMode: RenewalMode
  readonly currentPeriodEnd: Date
  readonly graceUntil: Date
  readonly stripeSubscriptionId: string | null
  readonly lastOrderId: number | null
}

export async function insertMembership(
  data: PluginData,
  membership: NewMembership,
): Promise<MembershipRow> {
  const row = await data.one(
    `insert into plugin_dues_membership
       (user_id, group_key, plan_key, status, renewal_mode,
        current_period_end, grace_until, stripe_subscription_id, last_order_id)
     values ($1, $2, $3, 'active', $4, $5, $6, $7, $8)
     returning *`,
    [
      membership.userId,
      membership.groupKey,
      membership.planKey,
      membership.renewalMode,
      membership.currentPeriodEnd,
      membership.graceUntil,
      membership.stripeSubscriptionId,
      membership.lastOrderId,
    ],
  )
  if (row === null) throw new Error('membership insert returned nothing')
  return membershipRow(row)
}

export async function extendMembership(
  data: PluginData,
  id: number,
  update: {
    readonly currentPeriodEnd: Date
    readonly graceUntil: Date
    readonly planKey?: string
    readonly renewalMode?: RenewalMode
    readonly lastOrderId?: number | null
    readonly stripeSubscriptionId?: string | null
  },
): Promise<void> {
  await data.query(
    `update plugin_dues_membership
        set status = 'active',
            current_period_end = greatest(current_period_end, $2),
            grace_until = greatest(grace_until, $3),
            plan_key = coalesce($4, plan_key),
            renewal_mode = coalesce($5, renewal_mode),
            last_order_id = coalesce($6, last_order_id),
            stripe_subscription_id = coalesce($7, stripe_subscription_id),
            needs_attention = null,
            updated_at = now()
      where id = $1`,
    [
      id,
      update.currentPeriodEnd,
      update.graceUntil,
      update.planKey ?? null,
      update.renewalMode ?? null,
      update.lastOrderId ?? null,
      update.stripeSubscriptionId ?? null,
    ],
  )
}

export async function setMembershipStatus(
  data: PluginData,
  id: number,
  status: MembershipStatus,
): Promise<void> {
  await data.query(
    `update plugin_dues_membership set status = $2, updated_at = now() where id = $1`,
    [id, status],
  )
}

export async function flagMembership(data: PluginData, id: number, reason: string): Promise<void> {
  await data.query(
    `update plugin_dues_membership set needs_attention = $2, updated_at = now() where id = $1`,
    [id, reason],
  )
}

export async function expireDueMemberships(data: PluginData, limit: number): Promise<number> {
  const rows = await data.query(
    `update plugin_dues_membership
        set status = 'expired', updated_at = now()
      where id in (
        select id from plugin_dues_membership
         where (status in ('active', 'grace') and grace_until <= now())
            or (status = 'closing' and current_period_end <= now())
         limit $1
      )
      returning id`,
    [limit],
  )
  return rows.length
}

export async function allMemberships(
  data: PluginData,
  limit = 200,
): Promise<readonly MembershipRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_membership
      order by needs_attention is not null desc,
               status in ('active', 'grace', 'closing') desc,
               updated_at desc
      limit $1`,
    [limit],
  )
  return rows.map(membershipRow)
}

export async function membershipsPastPeriod(
  data: PluginData,
  limit: number,
): Promise<readonly MembershipRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_membership
      where status = 'active'
        and renewal_mode = 'auto'
        and stripe_subscription_id is not null
        and current_period_end <= now()
      limit $1`,
    [limit],
  )
  return rows.map(membershipRow)
}

export async function recordEvent(
  data: PluginData,
  event: { readonly stripeEventId: string; readonly type: string; readonly payload: unknown },
): Promise<{ readonly id: number; readonly first: boolean }> {
  const inserted = await data.one(
    `insert into plugin_dues_event (stripe_event_id, type, payload)
     values ($1, $2, $3::jsonb)
     on conflict (stripe_event_id) do nothing
     returning id`,
    [event.stripeEventId, event.type, JSON.stringify(event.payload ?? null)],
  )
  if (inserted !== null) return { id: Number(inserted.id), first: true }

  const existing = await data.one('select id from plugin_dues_event where stripe_event_id = $1', [
    event.stripeEventId,
  ])
  if (existing === null) throw new Error('event insert lost a race it cannot lose')
  return { id: Number(existing.id), first: false }
}

export async function markEventProcessed(
  data: PluginData,
  id: number,
  outcome: string,
): Promise<void> {
  await data.query(
    `update plugin_dues_event set processed_at = now(), outcome = $2 where id = $1`,
    [id, outcome],
  )
}

export async function markEventFailed(
  data: PluginData,
  id: number,
  outcome: string,
): Promise<void> {
  await data.query(`update plugin_dues_event set outcome = $2 where id = $1`, [id, outcome])
}

export async function unprocessedEvents(
  data: PluginData,
  limit: number,
): Promise<readonly EventRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_event
      where processed_at is null
      order by received_at
      limit $1`,
    [limit],
  )
  return rows.map(eventRow)
}

export async function recentEvents(data: PluginData, limit = 20): Promise<readonly EventRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_event order by received_at desc limit $1`,
    [limit],
  )
  return rows.map(eventRow)
}

export interface NewLedgerEntry {
  readonly kind: LedgerRow['kind']
  readonly userId: number
  readonly membershipId: number | null
  readonly orderId: number | null
  readonly amountMinor: number
  readonly currency: string
  readonly stripeRef: string | null
  readonly note: string | null
}

export async function insertLedger(data: PluginData, entry: NewLedgerEntry): Promise<void> {
  await data.query(
    `insert into plugin_dues_ledger
       (kind, user_id, membership_id, order_id, amount_minor, currency, stripe_ref, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.kind,
      entry.userId,
      entry.membershipId,
      entry.orderId,
      entry.amountMinor,
      entry.currency,
      entry.stripeRef,
      entry.note,
    ],
  )
}

export async function recentLedger(data: PluginData, limit = 50): Promise<readonly LedgerRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_ledger order by occurred_at desc limit $1`,
    [limit],
  )
  return rows.map(ledgerRow)
}

export interface MonthlyTotal {
  readonly month: string
  readonly currency: string
  readonly grossMinor: number
  readonly refundedMinor: number
  readonly charges: number
}

export async function monthlyTotals(
  data: PluginData,
  months = 12,
): Promise<readonly MonthlyTotal[]> {
  const rows = await data.query(
    `select to_char(date_trunc('month', occurred_at), 'YYYY-MM') as month,
            currency,
            coalesce(sum(amount_minor) filter (where kind = 'charge'), 0)::bigint as gross_minor,
            coalesce(-sum(amount_minor) filter (where kind in ('refund', 'chargeback')), 0)::bigint as refunded_minor,
            count(*) filter (where kind = 'charge')::int as charges
       from plugin_dues_ledger
      group by 1, 2
      order by 1 desc
      limit $1`,
    [months],
  )
  return rows.map((row) => ({
    month: String(row.month),
    currency: String(row.currency),
    grossMinor: Number(row.gross_minor),
    refundedMinor: Number(row.refunded_minor),
    charges: Number(row.charges),
  }))
}

export async function attentionCount(data: PluginData): Promise<number> {
  const row = await data.one(
    `select
       (select count(*) from plugin_dues_membership where needs_attention is not null)::int
       + (select count(*) from plugin_dues_order where needs_attention is not null)::int
       as total`,
  )
  return row === null ? 0 : Number(row.total)
}

export async function ordersNeedingAttention(
  data: PluginData,
  limit = 50,
): Promise<readonly OrderRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_order
      where needs_attention is not null
      order by created_at desc
      limit $1`,
    [limit],
  )
  return rows.map(orderRow)
}

export async function clearMembershipAttention(data: PluginData, id: number): Promise<void> {
  await data.query(
    `update plugin_dues_membership set needs_attention = null, updated_at = now() where id = $1`,
    [id],
  )
}

export async function clearOrderAttention(data: PluginData, id: number): Promise<void> {
  await data.query(`update plugin_dues_order set needs_attention = null where id = $1`, [id])
}

export interface CodeRow {
  readonly id: number
  readonly code: string
  readonly percentOff: number
  readonly planKey: string | null
  readonly maxRedemptions: number | null
  readonly redeemedCount: number
  readonly expiresAt: Date | null
  readonly disabled: boolean
  readonly createdByUserId: number
  readonly stripeCouponId: string | null
  readonly createdAt: Date
}

function codeRow(row: Record<string, unknown>): CodeRow {
  return {
    id: Number(row.id),
    code: String(row.code),
    percentOff: Number(row.percent_off),
    planKey: asNullableString(row.plan_key),
    maxRedemptions:
      row.max_redemptions === null || row.max_redemptions === undefined
        ? null
        : Number(row.max_redemptions),
    redeemedCount: Number(row.redeemed_count),
    expiresAt: asNullableDate(row.expires_at),
    disabled: row.disabled === true,
    createdByUserId: Number(row.created_by_user_id),
    stripeCouponId: asNullableString(row.stripe_coupon_id),
    createdAt: asDate(row.created_at),
  }
}

export interface NewCode {
  readonly code: string
  readonly percentOff: number
  readonly planKey: string | null
  readonly maxRedemptions: number | null
  readonly expiresAt: Date | null
  readonly createdByUserId: number
}

export async function insertCode(data: PluginData, code: NewCode): Promise<CodeRow | null> {
  const row = await data.one(
    `insert into plugin_dues_code
       (code, percent_off, plan_key, max_redemptions, expires_at, created_by_user_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict ((lower(code))) do nothing
     returning *`,
    [
      code.code,
      code.percentOff,
      code.planKey,
      code.maxRedemptions,
      code.expiresAt,
      code.createdByUserId,
    ],
  )
  return row === null ? null : codeRow(row)
}

export async function codeByCode(data: PluginData, code: string): Promise<CodeRow | null> {
  const row = await data.one('select * from plugin_dues_code where lower(code) = lower($1)', [code])
  return row === null ? null : codeRow(row)
}

export async function codeById(data: PluginData, id: number): Promise<CodeRow | null> {
  const row = await data.one('select * from plugin_dues_code where id = $1', [id])
  return row === null ? null : codeRow(row)
}

export async function listCodes(data: PluginData, limit = 100): Promise<readonly CodeRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_code order by created_at desc limit $1`,
    [limit],
  )
  return rows.map(codeRow)
}

export async function setCodeDisabled(
  data: PluginData,
  id: number,
  disabled: boolean,
): Promise<void> {
  await data.query(`update plugin_dues_code set disabled = $2 where id = $1`, [id, disabled])
}

export async function saveCodeCoupon(
  data: PluginData,
  id: number,
  stripeCouponId: string,
): Promise<void> {
  await data.query(
    `update plugin_dues_code set stripe_coupon_id = $2 where id = $1 and stripe_coupon_id is null`,
    [id, stripeCouponId],
  )
}

export async function reserveCodeRedemption(
  data: PluginData,
  codeId: number,
  orderId: number,
): Promise<boolean> {
  return data.tx(async (tx) => {
    const locked = await tx.one(
      `select max_redemptions from plugin_dues_code where id = $1 for update`,
      [codeId],
    )
    if (locked === null) return false

    const existing = await tx.one(
      `select status from plugin_dues_code_reservation where order_id = $1`,
      [orderId],
    )
    if (existing !== null) return String(existing.status) !== 'released'

    const max =
      locked.max_redemptions === null || locked.max_redemptions === undefined
        ? null
        : Number(locked.max_redemptions)
    if (max !== null) {
      const active = await tx.one(
        `select count(*)::int as taken from plugin_dues_code_reservation
          where code_id = $1 and status in ('held', 'consumed')`,
        [codeId],
      )
      if (active !== null && Number(active.taken) >= max) return false
    }

    await tx.query(
      `insert into plugin_dues_code_reservation (code_id, order_id)
       values ($1, $2)
       on conflict (order_id) do nothing`,
      [codeId, orderId],
    )
    return true
  })
}

export async function consumeCodeReservation(
  data: PluginData,
  orderId: number,
  codeId: number,
): Promise<void> {
  await data.tx(async (tx) => {
    const consumed = await tx.one(
      `update plugin_dues_code_reservation
          set status = 'consumed', updated_at = now()
        where order_id = $1 and status = 'held'
        returning code_id`,
      [orderId],
    )
    if (consumed !== null) {
      await tx.query(
        `update plugin_dues_code set redeemed_count = redeemed_count + 1 where id = $1`,
        [Number(consumed.code_id)],
      )
      return
    }

    const present = await tx.one(
      `select id from plugin_dues_code_reservation where order_id = $1`,
      [orderId],
    )
    if (present !== null) return

    const recorded = await tx.one(
      `insert into plugin_dues_code_reservation (code_id, order_id, status)
       values ($1, $2, 'consumed')
       on conflict (order_id) do nothing
       returning id`,
      [codeId, orderId],
    )
    if (recorded !== null) {
      await tx.query(
        `update plugin_dues_code set redeemed_count = redeemed_count + 1 where id = $1`,
        [codeId],
      )
    }
  })
}

export async function releaseCodeReservation(data: PluginData, orderId: number): Promise<void> {
  await data.query(
    `update plugin_dues_code_reservation
        set status = 'released', updated_at = now()
      where order_id = $1 and status = 'held'`,
    [orderId],
  )
}

export interface PlanRow {
  readonly id: number
  readonly key: string
  readonly name: string
  readonly description: string | null
  readonly groupKey: string
  readonly priceMinor: number
  readonly currency: string
  readonly mode: PlanMode
  readonly periodSpec: string | null
  readonly billingInterval: 'month' | 'year' | null
  readonly stripePriceId: string | null
  readonly stripeProductId: string | null
  readonly giftable: boolean
  readonly hidden: boolean
  readonly archived: boolean
  readonly createdAt: Date
}

function planRow(row: Record<string, unknown>): PlanRow {
  return {
    id: Number(row.id),
    key: String(row.plan_key),
    name: String(row.name),
    description: asNullableString(row.description),
    groupKey: String(row.group_key),
    priceMinor: Number(row.price_minor),
    currency: String(row.currency),
    mode: String(row.mode) as PlanMode,
    periodSpec: asNullableString(row.period_spec),
    billingInterval: asNullableString(row.billing_interval) as 'month' | 'year' | null,
    stripePriceId: asNullableString(row.stripe_price_id),
    stripeProductId: asNullableString(row.stripe_product_id),
    giftable: row.giftable === true,
    hidden: row.hidden === true,
    archived: row.archived === true,
    createdAt: asDate(row.created_at),
  }
}

export interface NewPlan {
  readonly planKey: string
  readonly name: string
  readonly description: string | null
  readonly groupKey: string
  readonly priceMinor: number
  readonly currency: string
  readonly mode: PlanMode
  readonly periodSpec: string | null
  readonly billingInterval: 'month' | 'year' | null
  readonly stripePriceId?: string | null
  readonly stripeProductId?: string | null
  readonly giftable: boolean
  readonly hidden: boolean
}

export async function insertPlan(data: PluginData, plan: NewPlan): Promise<PlanRow | null> {
  const row = await data.one(
    `insert into plugin_dues_plan
       (plan_key, name, description, group_key, price_minor, currency, mode,
        period_spec, billing_interval, stripe_price_id, stripe_product_id,
        giftable, hidden)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (plan_key) do nothing
     returning *`,
    [
      plan.planKey,
      plan.name,
      plan.description,
      plan.groupKey,
      plan.priceMinor,
      plan.currency,
      plan.mode,
      plan.periodSpec,
      plan.billingInterval,
      plan.stripePriceId ?? null,
      plan.stripeProductId ?? null,
      plan.giftable,
      plan.hidden,
    ],
  )
  return row === null ? null : planRow(row)
}

export async function updatePlan(
  data: PluginData,
  id: number,
  update: {
    readonly name: string
    readonly description: string | null
    readonly groupKey: string
    readonly priceMinor: number
    readonly currency: string
    readonly periodSpec: string | null
    readonly billingInterval: 'month' | 'year' | null
    readonly giftable: boolean
    readonly hidden: boolean
  },
): Promise<void> {
  await data.query(
    `update plugin_dues_plan
        set name = $2, description = $3, group_key = $4, price_minor = $5,
            currency = $6, period_spec = $7, billing_interval = $8,
            giftable = $9, hidden = $10, updated_at = now()
      where id = $1`,
    [
      id,
      update.name,
      update.description,
      update.groupKey,
      update.priceMinor,
      update.currency,
      update.periodSpec,
      update.billingInterval,
      update.giftable,
      update.hidden,
    ],
  )
}

export async function setPlanStripePrice(
  data: PluginData,
  id: number,
  stripePriceId: string,
  stripeProductId: string | null,
): Promise<void> {
  await data.query(
    `update plugin_dues_plan
        set stripe_price_id = $2,
            stripe_product_id = coalesce($3, stripe_product_id),
            updated_at = now()
      where id = $1`,
    [id, stripePriceId, stripeProductId],
  )
}

export async function setPlanArchived(
  data: PluginData,
  id: number,
  archived: boolean,
): Promise<void> {
  await data.query(`update plugin_dues_plan set archived = $2, updated_at = now() where id = $1`, [
    id,
    archived,
  ])
}

export async function listPlans(data: PluginData): Promise<readonly PlanRow[]> {
  const rows = await data.query(`select * from plugin_dues_plan order by archived, created_at, id`)
  return rows.map(planRow)
}

export async function countPlans(data: PluginData): Promise<number> {
  const row = await data.one('select count(*)::int as total from plugin_dues_plan')
  return row === null ? 0 : Number(row.total)
}

export async function planRowByKey(data: PluginData, key: string): Promise<PlanRow | null> {
  const row = await data.one('select * from plugin_dues_plan where plan_key = $1', [key])
  return row === null ? null : planRow(row)
}

export async function planRowById(data: PluginData, id: number): Promise<PlanRow | null> {
  const row = await data.one('select * from plugin_dues_plan where id = $1', [id])
  return row === null ? null : planRow(row)
}

export async function longLiveMemberships(
  data: PluginData,
  horizon: Date,
  limit = 200,
): Promise<readonly MembershipRow[]> {
  const rows = await data.query(
    `select * from plugin_dues_membership
      where status in ('active', 'grace', 'closing')
        and grace_until > $1
      limit $2`,
    [horizon, limit],
  )
  return rows.map(membershipRow)
}
