import { isCurrencyCode, isValidMinorAmount } from './money'
import { type Period, parsePeriod, periodCeilingDays } from './period'

export interface DuesPlanInput {
  readonly key: string
  readonly name: string
  readonly description?: string
  readonly group: string
  readonly price: number
  readonly billing:
    | { readonly mode: 'auto'; readonly interval: 'month' | 'year'; readonly stripePriceId: string }
    | { readonly mode: 'fixed'; readonly period: string }
  readonly giftable?: boolean
  readonly hidden?: boolean
}

export interface DuesConfigInput {
  readonly label?: string
  readonly plans?: readonly DuesPlanInput[]
  readonly extraRedirectHosts?: readonly string[]
}

export interface DuesPlan {
  readonly key: string
  readonly name: string
  readonly description: string | null
  readonly group: string
  readonly price: number
  readonly billing:
    | { readonly mode: 'auto'; readonly interval: 'month' | 'year'; readonly stripePriceId: string }
    | { readonly mode: 'fixed'; readonly period: string; readonly parsed: Period }
  readonly giftable: boolean
  readonly hidden: boolean
}

export interface DuesStaticConfig {
  readonly label: string
  readonly seedPlans: readonly DuesPlan[]
  readonly extraRedirectHosts: readonly string[]
}

export interface DuesConfig extends DuesStaticConfig {
  readonly currency: string
  readonly graceDays: number
}

const PLAN_KEY = /^[a-z][a-z0-9-]{0,39}$/
const MAX_GRANTABLE_DAYS = 2 * 366

export const DEFAULT_CURRENCY = 'usd'
export const DEFAULT_GRACE_DAYS = 7
export const MIN_GRACE_DAYS = 0
export const MAX_GRACE_DAYS = 30

export const DUES_CURRENCY_OPTIONS: readonly { readonly value: string; readonly label: string }[] =
  [
    { value: 'usd', label: 'USD' },
    { value: 'eur', label: 'EUR' },
    { value: 'gbp', label: 'GBP' },
    { value: 'cad', label: 'CAD' },
    { value: 'aud', label: 'AUD' },
    { value: 'nzd', label: 'NZD' },
    { value: 'chf', label: 'CHF' },
    { value: 'jpy', label: 'JPY' },
    { value: 'sek', label: 'SEK' },
    { value: 'nok', label: 'NOK' },
    { value: 'dkk', label: 'DKK' },
    { value: 'pln', label: 'PLN' },
    { value: 'czk', label: 'CZK' },
    { value: 'sgd', label: 'SGD' },
    { value: 'hkd', label: 'HKD' },
    { value: 'inr', label: 'INR' },
    { value: 'brl', label: 'BRL' },
    { value: 'mxn', label: 'MXN' },
    { value: 'zar', label: 'ZAR' },
  ]

function refuse(message: string): never {
  throw new Error(`dues plugin configuration: ${message}`)
}

export function parseDuesConfig(input: DuesConfigInput = {}): DuesStaticConfig {
  const label = (input.label ?? 'Membership').trim()
  if (label === '') refuse('label must not be empty.')

  const seen = new Set<string>()
  const plans = (input.plans ?? []).map((plan): DuesPlan => {
    const where = `plan "${plan.key}"`

    if (!PLAN_KEY.test(plan.key)) {
      refuse(`${where}: keys are lower-case letters, digits and hyphens.`)
    }
    if (seen.has(plan.key)) refuse(`${where} is declared twice.`)
    seen.add(plan.key)

    if (plan.name.trim() === '') refuse(`${where}: needs a name members will read.`)
    if (!PLAN_KEY.test(plan.group)) {
      refuse(`${where}: "${plan.group}" is not a valid group key.`)
    }
    if (!isValidMinorAmount(plan.price)) {
      refuse(
        `${where}: price must be a positive whole number of minor units — 500 is £5.00. ` +
          'A decimal here is almost always a hundredfold mistake.',
      )
    }

    if (plan.billing.mode === 'auto') {
      if (!plan.billing.stripePriceId.startsWith('price_')) {
        refuse(
          `${where}: an auto-renewing plan needs the Stripe price id (price_…) it bills ` +
            'against. Create the price in the Stripe dashboard and paste its id.',
        )
      }
      if (plan.giftable === true) {
        refuse(
          `${where}: an auto-renewing plan cannot be a gift. It would charge the buyer's ` +
            "card forever for someone else's membership — sell a fixed-term pass instead.",
        )
      }
      return {
        key: plan.key,
        name: plan.name.trim(),
        description: plan.description?.trim() || null,
        group: plan.group,
        price: plan.price,
        billing: plan.billing,
        giftable: false,
        hidden: plan.hidden === true,
      }
    }

    const parsed = parsePeriod(plan.billing.period)
    if (parsed === null) {
      refuse(`${where}: "${plan.billing.period}" is not an ISO-8601 period like P90D, P1M or P1Y.`)
    }
    if (periodCeilingDays(parsed) + MAX_GRACE_DAYS > MAX_GRANTABLE_DAYS) {
      refuse(
        `${where}: the period plus the longest possible grace window can reach past two ` +
          'years, and the board caps a plugin grant at two years. Sell a shorter pass.',
      )
    }

    return {
      key: plan.key,
      name: plan.name.trim(),
      description: plan.description?.trim() || null,
      group: plan.group,
      price: plan.price,
      billing: { ...plan.billing, parsed },
      giftable: plan.giftable !== false,
      hidden: plan.hidden === true,
    }
  })

  for (const host of input.extraRedirectHosts ?? []) {
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
      refuse(`"${host}" is not a plain host name.`)
    }
  }

  return {
    label,
    seedPlans: plans,
    extraRedirectHosts: input.extraRedirectHosts ?? [],
  }
}

function clampGraceDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRACE_DAYS
  return Math.min(MAX_GRACE_DAYS, Math.max(MIN_GRACE_DAYS, Math.round(value)))
}

export function resolveDuesConfig(
  staticConfig: DuesStaticConfig,
  settings: Readonly<Record<string, string | number | boolean>>,
): DuesConfig {
  const rawCurrency = String(settings.currency ?? DEFAULT_CURRENCY).toLowerCase()
  const currency = isCurrencyCode(rawCurrency) ? rawCurrency : DEFAULT_CURRENCY

  const rawGraceDays = settings.grace_days
  const graceDays = clampGraceDays(
    typeof rawGraceDays === 'number' ? rawGraceDays : DEFAULT_GRACE_DAYS,
  )

  return { ...staticConfig, currency, graceDays }
}
