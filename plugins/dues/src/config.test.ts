import { describe, expect, it } from 'vitest'

import { type DuesConfigInput, parseDuesConfig } from './config'

const FIXED = {
  key: 'pass-90',
  name: '90-day pass',
  group: 'supporters',
  price: 1200,
  billing: { mode: 'fixed', period: 'P90D' },
} as const

const AUTO = {
  key: 'supporter-month',
  name: 'Supporter',
  group: 'supporters',
  price: 500,
  billing: { mode: 'auto', interval: 'month', stripePriceId: 'price_123' },
} as const

function config(overrides: Partial<DuesConfigInput> = {}): DuesConfigInput {
  return { currency: 'gbp', plans: [FIXED, AUTO], ...overrides }
}

describe('parseDuesConfig', () => {
  it('parses a sound configuration and fills the defaults', () => {
    const parsed = parseDuesConfig(config())
    expect(parsed.currency).toBe('gbp')
    expect(parsed.graceDays).toBe(7)
    expect(parsed.label).toBe('Membership')
    expect(parsed.seedPlans).toHaveLength(2)
  })

  it('a fixed plan is giftable by default; an auto plan never is', () => {
    const parsed = parseDuesConfig(config())
    const seed = (key: string) => parsed.seedPlans.find((plan) => plan.key === key)
    expect(seed('pass-90')?.giftable).toBe(true)
    expect(seed('supporter-month')?.giftable).toBe(false)
  })

  it('refuses a giftable auto plan outright', () => {
    expect(() => parseDuesConfig(config({ plans: [{ ...AUTO, giftable: true }] }))).toThrow(
      /cannot be a gift/,
    )
  })

  it.each([
    [{ currency: 'pounds' }, /ISO 4217/],
    [{ graceDays: 45 }, /0 to 30/],
    [{ graceDays: -1 }, /0 to 30/],
    [{ label: '  ' }, /label/],
  ])('refuses %o', (override, message) => {
    expect(() => parseDuesConfig(config(override as Partial<DuesConfigInput>))).toThrow(message)
  })

  it.each([
    [{ ...FIXED, key: 'Bad Key' }, /keys are/],
    [{ ...FIXED, name: ' ' }, /needs a name/],
    [{ ...FIXED, group: 'Not A Group' }, /group key/],
    [{ ...FIXED, price: 12.5 }, /minor units/],
    [{ ...FIXED, price: 0 }, /minor units/],
    [{ ...FIXED, billing: { mode: 'fixed', period: 'ninety days' } }, /ISO-8601/],
    [{ ...FIXED, billing: { mode: 'fixed', period: 'P3Y' } }, /two years/],
    [
      { ...AUTO, billing: { mode: 'auto', interval: 'month', stripePriceId: 'plan_1' } },
      /price id/,
    ],
  ])('refuses the plan %o', (plan, message) => {
    expect(() => parseDuesConfig(config({ plans: [plan as never] }))).toThrow(message)
  })

  it('refuses two plans with one key', () => {
    expect(() => parseDuesConfig(config({ plans: [FIXED, { ...FIXED }] }))).toThrow(/twice/)
  })

  it('the period plus grace must stay inside the grant cap', () => {
    expect(() =>
      parseDuesConfig(
        config({
          graceDays: 30,
          plans: [{ ...FIXED, billing: { mode: 'fixed', period: 'P2Y' } }],
        }),
      ),
    ).toThrow(/two years/)
  })

  it('seeds are optional — a board may open its shop from the panel alone', () => {
    const parsed = parseDuesConfig({ currency: 'gbp' })
    expect(parsed.seedPlans).toEqual([])
  })

  it('a hidden seed keeps its flag for the plan table to honour', () => {
    const parsed = parseDuesConfig(config({ plans: [FIXED, { ...AUTO, hidden: true }] }))
    expect(parsed.seedPlans.find((plan) => plan.key === 'supporter-month')?.hidden).toBe(true)
  })

  it('validates extra redirect hosts as bare hosts', () => {
    expect(() => parseDuesConfig(config({ extraRedirectHosts: ['ok.example'] }))).not.toThrow()
    expect(() => parseDuesConfig(config({ extraRedirectHosts: ['https://bad.example'] }))).toThrow(
      /host name/,
    )
  })
})
