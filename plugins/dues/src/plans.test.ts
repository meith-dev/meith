import { describe, expect, it } from 'vitest'

import { addDays } from './period'
import {
  clampGrantUntil,
  describeBilling,
  GRANT_WINDOW_DAYS,
  isLifetime,
  LIFETIME_END,
  parsePlanForm,
} from './plans'
import type { PlanRow } from './store'

const NOW = new Date('2026-08-11T12:00:00Z')

describe('clampGrantUntil', () => {
  it('leaves a near expiry alone and clamps a far one to the window', () => {
    const near = addDays(NOW, 97)
    expect(clampGrantUntil(near, NOW)).toEqual(near)

    const far = addDays(NOW, 5000)
    expect(clampGrantUntil(far, NOW)).toEqual(addDays(NOW, GRANT_WINDOW_DAYS))
    expect(clampGrantUntil(LIFETIME_END, NOW)).toEqual(addDays(NOW, GRANT_WINDOW_DAYS))
  })
})

describe('isLifetime', () => {
  it('recognises the sentinel and nothing sooner', () => {
    expect(isLifetime(LIFETIME_END)).toBe(true)
    expect(isLifetime(addDays(NOW, 730))).toBe(false)
  })
})

describe('parsePlanForm', () => {
  const base = {
    key: 'day-pass',
    name: 'Day pass',
    group: 'supporters',
    price: '100',
    currency: 'gbp',
    mode: 'fixed',
    length: '1',
    unit: 'days',
    giftable: 'on',
  }

  it('builds a fixed plan with an ISO period from length and unit', () => {
    const parsed = parsePlanForm(base, 7)
    expect(parsed).toMatchObject({
      ok: true,
      plan: {
        planKey: 'day-pass',
        priceMinor: 100,
        currency: 'gbp',
        mode: 'fixed',
        periodSpec: 'P1D',
        billingInterval: null,
        giftable: true,
      },
    })
  })

  it('builds subscription and lifetime plans', () => {
    expect(
      parsePlanForm({ ...base, mode: 'auto', interval: 'year', giftable: undefined }, 7),
    ).toMatchObject({ ok: true, plan: { mode: 'auto', billingInterval: 'year', giftable: false } })

    expect(parsePlanForm({ ...base, mode: 'lifetime' }, 7)).toMatchObject({
      ok: true,
      plan: { mode: 'lifetime', periodSpec: null, giftable: true },
    })
  })

  it('normalises key, currency and group to lower case; trims the name', () => {
    const parsed = parsePlanForm(
      { ...base, key: 'Day-Pass', currency: 'GBP', group: 'Supporters', name: ' Day pass ' },
      7,
    )
    expect(parsed).toMatchObject({
      ok: true,
      plan: { planKey: 'day-pass', currency: 'gbp', groupKey: 'supporters', name: 'Day pass' },
    })
  })

  it('refuses each broken field with its own error', () => {
    const error = (form: Record<string, string | undefined>) => {
      const parsed = parsePlanForm(form, 7)
      return parsed.ok ? 'ok' : parsed.error
    }

    expect(error({ ...base, key: 'Bad Key!' })).toBe('bad-key')
    expect(error({ ...base, name: '  ' })).toBe('bad-name')
    expect(error({ ...base, group: '' })).toBe('bad-group')
    expect(error({ ...base, price: '9.99' })).toBe('bad-price')
    expect(error({ ...base, currency: 'pounds' })).toBe('bad-currency')
    expect(error({ ...base, mode: 'monthly' })).toBe('bad-mode')
    expect(error({ ...base, length: '0' })).toBe('bad-length')
    expect(error({ ...base, unit: 'fortnights' })).toBe('bad-length')
    expect(error({ ...base, length: '3', unit: 'years' })).toBe('too-long')
    expect(error({ ...base, mode: 'auto', interval: 'daily' })).toBe('bad-interval')
    expect(error({ ...base, mode: 'auto', interval: 'month' })).toBe('auto-gift')
  })

  it('the two-year cap counts the grace window too', () => {
    const twoYearsLessGrace = parsePlanForm({ ...base, length: '725', unit: 'days' }, 7)
    expect(twoYearsLessGrace.ok).toBe(true)
    const overWithGrace = parsePlanForm({ ...base, length: '726', unit: 'days' }, 7)
    expect(overWithGrace.ok).toBe(false)
  })
})

describe('describeBilling', () => {
  const plan = (overrides: Partial<PlanRow>): PlanRow => ({
    id: 1, key: 'p', name: 'P', description: null, groupKey: 'g',
    priceMinor: 100, currency: 'gbp', mode: 'fixed', periodSpec: 'P90D',
    billingInterval: null, stripePriceId: null, stripeProductId: null,
    giftable: true, hidden: false, archived: false, createdAt: NOW,
    ...overrides,
  })

  it('speaks each mode', () => {
    expect(describeBilling(plan({}))).toBe('90 days')
    expect(describeBilling(plan({ periodSpec: 'P1Y' }))).toBe('1 year')
    expect(describeBilling(plan({ mode: 'auto', billingInterval: 'year' }))).toBe('every year')
    expect(describeBilling(plan({ mode: 'lifetime', periodSpec: null }))).toBe('once, for good')
  })
})
