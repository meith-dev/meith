import type { PluginRequest, PluginResponse } from '@meith/plugin-kit'

import { generateCode, normalizeCode, validCodeShape } from './codes'
import { anyPlanByKey, clampGrantUntil, isLifetime, parsePlanForm } from './plans'
import { addDays } from './period'
import type { DuesServices } from './handlers'
import {
  clearMembershipAttention,
  clearOrderAttention,
  codeById,
  extendMembership,
  flagMembership,
  insertCode,
  insertPlan,
  membershipById,
  orderById,
  planRowById,
  setCodeDisabled,
  setMembershipStatus,
  setPlanArchived,
  setPlanStripePrice,
  updatePlan,
  type MembershipRow,
} from './store'

function toAdmin(
  page: 'codes' | 'members' | 'status' | 'plans',
  query: Record<string, string>,
): PluginResponse {
  const params = new URLSearchParams(query).toString()
  return {
    kind: 'redirect',
    to: `/admin/plugins/dues/${page}${params === '' ? '' : `?${params}`}`,
  }
}

function asId(value: string | undefined): number | null {
  const id = Number(value ?? '')
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function isLive(membership: MembershipRow): boolean {
  return (
    membership.status === 'active' ||
    membership.status === 'grace' ||
    membership.status === 'closing'
  )
}

export async function handleAdminCodeCreate(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const typed = normalizeCode(request.form?.code ?? '')
  const code = typed === '' ? generateCode() : typed
  if (!validCodeShape(code)) return toAdmin('codes', { error: 'bad-code', code: typed })

  const percentOff = Number(request.form?.percent ?? '')
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) {
    return toAdmin('codes', { error: 'bad-percent', code: typed })
  }

  const planInput = (request.form?.plan ?? '').trim()
  if (
    planInput !== '' &&
    (await anyPlanByKey(services.context.data, services.config, planInput)) === null
  ) {
    return toAdmin('codes', { error: 'bad-plan', code: typed })
  }

  const maxInput = (request.form?.max ?? '').trim()
  const maxRedemptions = maxInput === '' ? null : Number(maxInput)
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
    return toAdmin('codes', { error: 'bad-max', code: typed })
  }

  const expiresInput = (request.form?.expires ?? '').trim()
  let expiresAt: Date | null = null
  if (expiresInput !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresInput)) {
      return toAdmin('codes', { error: 'bad-expiry', code: typed })
    }
    expiresAt = new Date(`${expiresInput}T23:59:59Z`)
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= services.now()) {
      return toAdmin('codes', { error: 'bad-expiry', code: typed })
    }
  }

  const inserted = await insertCode(services.context.data, {
    code,
    percentOff,
    planKey: planInput === '' ? null : planInput,
    maxRedemptions,
    expiresAt,
    createdByUserId: request.viewer.userId ?? 0,
  })
  if (inserted === null) return toAdmin('codes', { error: 'duplicate-code', code })

  return toAdmin('codes', { created: inserted.code })
}

export async function handleAdminCodeDisable(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const id = asId(request.form?.code)
  const code = id === null ? null : await codeById(services.context.data, id)
  if (code === null) return toAdmin('codes', { error: 'no-such-code' })

  const disabled = request.form?.disabled === '1'
  await setCodeDisabled(services.context.data, code.id, disabled)
  return toAdmin('codes', { [disabled ? 'disabled' : 'enabled']: code.code })
}

export async function handleAdminExtend(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const days = Number(request.form?.days ?? '')
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    return toAdmin('members', { error: 'bad-days' })
  }

  const id = asId(request.form?.membership)
  const membership = id === null ? null : await membershipById(services.context.data, id)
  if (membership === null || !isLive(membership) || isLifetime(membership.currentPeriodEnd)) {
    return toAdmin('members', { error: 'not-live' })
  }

  const now = services.now()
  const base = membership.currentPeriodEnd > now ? membership.currentPeriodEnd : now
  const periodEnd = addDays(base, days)
  const graceUntil = addDays(periodEnd, services.config.graceDays)

  await extendMembership(services.context.data, membership.id, {
    currentPeriodEnd: periodEnd,
    graceUntil,
  })

  try {
    await services.context.grants.grant({
      userId: membership.userId,
      groupKey: membership.groupKey,
      until: clampGrantUntil(graceUntil, now),
      reason: `dues: an administrator extended membership ${membership.id} by ${days} days`,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await flagMembership(services.context.data, membership.id, `grant refused: ${reason}`)
    return toAdmin('members', { error: 'grant-refused' })
  }

  return toAdmin('members', { extended: String(membership.id) })
}

export async function handleAdminCancel(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const id = asId(request.form?.membership)
  const membership = id === null ? null : await membershipById(services.context.data, id)
  if (
    membership === null ||
    !isLive(membership) ||
    membership.renewalMode !== 'auto' ||
    membership.stripeSubscriptionId === null
  ) {
    return toAdmin('members', { error: 'not-cancellable' })
  }
  if (services.stripe === null) return toAdmin('members', { error: 'unconfigured' })

  try {
    await services.stripe.setCancelAtPeriodEnd(membership.stripeSubscriptionId, true)
  } catch (error) {
    services.context.logger.error('dues: admin cancel at period end failed', {
      membershipId: membership.id,
      message: error instanceof Error ? error.message : String(error),
    })
    return toAdmin('members', { error: 'stripe-error' })
  }

  await setMembershipStatus(services.context.data, membership.id, 'closing')
  return toAdmin('members', { cancelled: String(membership.id) })
}

export async function handleAdminRevoke(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const id = asId(request.form?.membership)
  const membership = id === null ? null : await membershipById(services.context.data, id)
  if (membership === null || !isLive(membership)) {
    return toAdmin('members', { error: 'not-live' })
  }

  await setMembershipStatus(services.context.data, membership.id, 'revoked')

  try {
    await services.context.grants.revoke({
      userId: membership.userId,
      groupKey: membership.groupKey,
      reason: `dues: an administrator revoked membership ${membership.id}`,
    })
  } catch (error) {
    services.context.logger.error('dues: revoke grant removal failed', {
      membershipId: membership.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  if (
    membership.renewalMode === 'auto' &&
    membership.stripeSubscriptionId !== null &&
    services.stripe !== null
  ) {
    try {
      await services.stripe.setCancelAtPeriodEnd(membership.stripeSubscriptionId, true)
    } catch {
      await flagMembership(
        services.context.data,
        membership.id,
        'revoked here, but Stripe still holds the subscription — cancel it in the dashboard',
      )
    }
  }

  return toAdmin('members', { revoked: String(membership.id) })
}

type PriceResolution =
  | { readonly ok: true; readonly priceId: string; readonly productId: string | null }
  | { readonly ok: false; readonly error: string }

// A subscription plan bills against a real Stripe price. The admin can paste
// one made in the dashboard, or leave the box empty and have the plugin mint a
// product and price to match the form. Stripe prices are immutable, so a price
// change mints a new one — running subscriptions keep billing what they signed
// up for, only new checkouts see the new price.
async function resolveAutoPrice(
  services: DuesServices,
  plan: {
    readonly name: string
    readonly priceMinor: number
    readonly currency: string
    readonly interval: 'month' | 'year'
    readonly key: string
  },
  pasted: string,
  existingProductId: string | null,
): Promise<PriceResolution> {
  if (pasted !== '') {
    if (!pasted.startsWith('price_')) return { ok: false, error: 'bad-stripe-price' }
    return { ok: true, priceId: pasted, productId: existingProductId }
  }

  if (services.stripe === null) return { ok: false, error: 'unconfigured' }

  try {
    const productId =
      existingProductId ??
      (await services.stripe.createProduct({ name: plan.name, reference: plan.key })).id
    const price = await services.stripe.createPrice({
      productId,
      unitAmount: plan.priceMinor,
      currency: plan.currency,
      interval: plan.interval,
      reference: `${plan.key}-${plan.priceMinor}-${plan.currency}-${plan.interval}`,
    })
    return { ok: true, priceId: price.id, productId }
  } catch (error) {
    services.context.logger.error('dues: could not mint the Stripe price', {
      plan: plan.key,
      message: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'stripe-error' }
  }
}

export async function handleAdminPlanCreate(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const parsed = parsePlanForm(request.form ?? {}, services.config.graceDays)
  if (!parsed.ok) return toAdmin('plans', { error: parsed.error })
  const plan = parsed.plan

  if ((await anyPlanByKey(services.context.data, services.config, plan.planKey)) !== null) {
    return toAdmin('plans', { error: 'duplicate-plan' })
  }

  let stripePriceId: string | null = null
  let stripeProductId: string | null = null
  if (plan.mode === 'auto') {
    const price = await resolveAutoPrice(
      services,
      {
        name: plan.name,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        interval: plan.billingInterval ?? 'month',
        key: plan.planKey,
      },
      (request.form?.stripe_price ?? '').trim(),
      null,
    )
    if (!price.ok) return toAdmin('plans', { error: price.error })
    stripePriceId = price.priceId
    stripeProductId = price.productId
  }

  const inserted = await insertPlan(services.context.data, {
    ...plan,
    stripePriceId,
    stripeProductId,
  })
  if (inserted === null) return toAdmin('plans', { error: 'duplicate-plan' })

  return toAdmin('plans', { created: inserted.key })
}

export async function handleAdminPlanUpdate(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const id = asId(request.form?.id)
  const existing = id === null ? null : await planRowById(services.context.data, id)
  if (existing === null) return toAdmin('plans', { error: 'no-such-plan' })

  const parsed = parsePlanForm(
    { ...request.form, key: existing.key, mode: existing.mode },
    services.config.graceDays,
  )
  if (!parsed.ok) return toAdmin('plans', { error: parsed.error })
  const plan = parsed.plan

  if (existing.mode === 'auto') {
    const pasted = (request.form?.stripe_price ?? '').trim()
    const changed =
      plan.priceMinor !== existing.priceMinor ||
      plan.currency !== existing.currency ||
      plan.billingInterval !== existing.billingInterval

    if (pasted !== '' || changed || existing.stripePriceId === null) {
      const price = await resolveAutoPrice(
        services,
        {
          name: plan.name,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          interval: plan.billingInterval ?? 'month',
          key: existing.key,
        },
        pasted,
        existing.stripeProductId,
      )
      if (!price.ok) return toAdmin('plans', { error: price.error })
      await setPlanStripePrice(services.context.data, existing.id, price.priceId, price.productId)
    }
  }

  await updatePlan(services.context.data, existing.id, {
    name: plan.name,
    description: plan.description,
    groupKey: plan.groupKey,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    periodSpec: existing.mode === 'fixed' ? plan.periodSpec : existing.periodSpec,
    billingInterval: existing.mode === 'auto' ? plan.billingInterval : existing.billingInterval,
    giftable: plan.giftable,
    hidden: plan.hidden,
  })

  return toAdmin('plans', { updated: existing.key })
}

export async function handleAdminPlanArchive(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const id = asId(request.form?.id)
  const plan = id === null ? null : await planRowById(services.context.data, id)
  if (plan === null) return toAdmin('plans', { error: 'no-such-plan' })

  const archive = request.form?.archived === '1'
  await setPlanArchived(services.context.data, plan.id, archive)
  return toAdmin('plans', { [archive ? 'archived' : 'restored']: plan.key })
}

export async function handleAdminClear(
  services: DuesServices,
  request: PluginRequest,
): Promise<PluginResponse> {
  const membershipId = asId(request.form?.membership)
  if (membershipId !== null) {
    const membership = await membershipById(services.context.data, membershipId)
    if (membership === null) return toAdmin('members', { error: 'not-live' })
    await clearMembershipAttention(services.context.data, membership.id)
    return toAdmin('members', { cleared: String(membership.id) })
  }

  const orderId = asId(request.form?.order)
  if (orderId !== null) {
    const order = await orderById(services.context.data, orderId)
    if (order === null) return toAdmin('status', { error: 'no-such-order' })
    await clearOrderAttention(services.context.data, order.id)
    return toAdmin('status', { cleared: String(order.id) })
  }

  return toAdmin('status', { error: 'nothing-to-clear' })
}
