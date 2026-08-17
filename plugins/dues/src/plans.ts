import type { PluginData } from '@meith/plugin-kit'

import type { DuesConfig } from './config'
import { isCurrencyCode, isValidMinorAmount } from './money'
import { addDays, type Period, parsePeriod, periodCeilingDays } from './period'
import {
  countPlans,
  insertPlan,
  listPlans,
  type NewPlan,
  type PlanMode,
  type PlanRow,
} from './store'

export const GRANT_WINDOW_DAYS = 700
export const TOP_UP_WHEN_WITHIN_DAYS = 90
export const LIFETIME_END = new Date('9999-12-31T00:00:00Z')

export const MAX_PLAN_DAYS = 2 * 366

const PLAN_KEY = /^[a-z][a-z0-9-]{0,39}$/

export function clampGrantUntil(graceUntil: Date, now: Date): Date {
  const ceiling = addDays(now, GRANT_WINDOW_DAYS)
  return graceUntil > ceiling ? ceiling : graceUntil
}

export function isLifetime(periodEnd: Date): boolean {
  return periodEnd >= LIFETIME_END
}

export async function loadPlans(data: PluginData, config: DuesConfig): Promise<readonly PlanRow[]> {
  if ((await countPlans(data)) === 0 && config.seedPlans.length > 0) {
    for (const seed of config.seedPlans) {
      await insertPlan(data, {
        planKey: seed.key,
        name: seed.name,
        description: seed.description,
        groupKey: seed.group,
        priceMinor: seed.price,
        currency: config.currency,
        mode: seed.billing.mode,
        periodSpec: seed.billing.mode === 'fixed' ? seed.billing.period : null,
        billingInterval: seed.billing.mode === 'auto' ? seed.billing.interval : null,
        stripePriceId: seed.billing.mode === 'auto' ? seed.billing.stripePriceId : null,
        stripeProductId: null,
        giftable: seed.giftable,
        hidden: seed.hidden,
      })
    }
  }
  return listPlans(data)
}

export async function shopPlans(data: PluginData, config: DuesConfig): Promise<readonly PlanRow[]> {
  return (await loadPlans(data, config)).filter((plan) => !plan.hidden && !plan.archived)
}

export async function anyPlanByKey(
  data: PluginData,
  config: DuesConfig,
  key: string,
): Promise<PlanRow | null> {
  return (await loadPlans(data, config)).find((plan) => plan.key === key) ?? null
}

export async function sellablePlanByKey(
  data: PluginData,
  config: DuesConfig,
  key: string,
): Promise<PlanRow | null> {
  const plan = await anyPlanByKey(data, config, key)
  return plan === null || plan.archived ? null : plan
}

export function planPeriod(plan: PlanRow): Period | null {
  return plan.periodSpec === null ? null : parsePeriod(plan.periodSpec)
}

export function describeBilling(plan: PlanRow): string {
  if (plan.mode === 'auto') return `every ${plan.billingInterval ?? 'month'}`
  if (plan.mode === 'lifetime') return 'once, for good'
  const period = planPeriod(plan)
  if (period === null) return plan.periodSpec ?? ''
  const parts: string[] = []
  const piece = (count: number, word: string) => {
    if (count > 0) parts.push(`${count} ${word}${count === 1 ? '' : 's'}`)
  }
  piece(period.years, 'year')
  piece(period.months, 'month')
  piece(period.weeks, 'week')
  piece(period.days, 'day')
  return parts.join(', ')
}

export interface PlanFormInput {
  readonly key?: string | undefined
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly group?: string | undefined
  readonly price?: string | undefined
  readonly currency?: string | undefined
  readonly mode?: string | undefined
  readonly length?: string | undefined
  readonly unit?: string | undefined
  readonly interval?: string | undefined
  readonly stripe_price?: string | undefined
  readonly giftable?: string | undefined
  readonly hidden?: string | undefined
}

export type PlanParse =
  | { readonly ok: true; readonly plan: Omit<NewPlan, 'stripePriceId' | 'stripeProductId'> }
  | { readonly ok: false; readonly error: string }

function bad(error: string): PlanParse {
  return { ok: false, error }
}

export function parsePlanForm(form: PlanFormInput, graceDays: number): PlanParse {
  const key = (form.key ?? '').trim().toLowerCase()
  if (!PLAN_KEY.test(key)) return bad('bad-key')

  const name = (form.name ?? '').trim()
  if (name === '') return bad('bad-name')

  const group = (form.group ?? '').trim().toLowerCase()
  if (!PLAN_KEY.test(group)) return bad('bad-group')

  const price = Number(form.price ?? '')
  if (!isValidMinorAmount(price)) return bad('bad-price')

  const currency = (form.currency ?? '').trim().toLowerCase()
  if (!isCurrencyCode(currency)) return bad('bad-currency')

  const mode = form.mode as PlanMode
  if (mode !== 'auto' && mode !== 'fixed' && mode !== 'lifetime') return bad('bad-mode')

  let periodSpec: string | null = null
  let billingInterval: 'month' | 'year' | null = null

  if (mode === 'fixed') {
    const length = Number(form.length ?? '')
    const unit = form.unit ?? ''
    const letter =
      unit === 'days'
        ? 'D'
        : unit === 'weeks'
          ? 'W'
          : unit === 'months'
            ? 'M'
            : unit === 'years'
              ? 'Y'
              : null
    if (letter === null || !Number.isInteger(length) || length < 1) return bad('bad-length')

    periodSpec = `P${length}${letter}`
    const parsed = parsePeriod(periodSpec)
    if (parsed === null) return bad('bad-length')
    if (periodCeilingDays(parsed) + graceDays > MAX_PLAN_DAYS) return bad('too-long')
  }

  if (mode === 'auto') {
    if (form.interval !== 'month' && form.interval !== 'year') return bad('bad-interval')
    billingInterval = form.interval
    if (form.giftable === 'on') return bad('auto-gift')
  }

  return {
    ok: true,
    plan: {
      planKey: key,
      name,
      description: (form.description ?? '').trim() || null,
      groupKey: group,
      priceMinor: price,
      currency,
      mode,
      periodSpec,
      billingInterval,
      giftable: mode === 'auto' ? false : form.giftable === 'on',
      hidden: form.hidden === 'on',
    },
  }
}
