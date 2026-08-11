import type { PluginRequest, PluginResponse } from '@meith/plugin-kit'

import { generateCode, normalizeCode, validCodeShape } from './codes'
import { planByKey } from './config'
import { addDays } from './period'
import type { DuesServices } from './handlers'
import {
  clearMembershipAttention,
  clearOrderAttention,
  codeById,
  extendMembership,
  flagMembership,
  insertCode,
  membershipById,
  orderById,
  setCodeDisabled,
  setMembershipStatus,
  type MembershipRow,
} from './store'

function toAdmin(page: 'codes' | 'members' | 'status', query: Record<string, string>): PluginResponse {
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
  if (planInput !== '' && planByKey(services.config, planInput) === null) {
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
  if (membership === null || !isLive(membership)) {
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
      until: graceUntil,
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
