import { describe, expect, it } from 'vitest'

import { resolvePluginSettings } from '@meith/plugin-kit'

import {
  DEFAULT_CURRENCY,
  DEFAULT_GRACE_DAYS,
  type DuesConfigInput,
  MAX_GRACE_DAYS,
  parseDuesConfig,
  resolveDuesConfig,
} from './config'
import { dues } from './definition'

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
  return { plans: [FIXED, AUTO], ...overrides }
}

describe('parseDuesConfig', () => {
  it('parses a sound configuration and fills the defaults', () => {
    const parsed = parseDuesConfig(config())
    expect(parsed.label).toBe('Membership')
    expect(parsed.seedPlans).toHaveLength(2)
  })

  it('takes no arguments at all — the zero-argument export', () => {
    const parsed = parseDuesConfig()
    expect(parsed.label).toBe('Membership')
    expect(parsed.seedPlans).toEqual([])
    expect(parsed.extraRedirectHosts).toEqual([])
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

  it('refuses an empty label', () => {
    expect(() => parseDuesConfig(config({ label: '  ' }))).toThrow(/label/)
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

  it('the period cap is checked against the longest possible grace window, not the current one', () => {
    // 2 * 366 = 732 is the grant cap; MAX_GRACE_DAYS (30) is always added,
    // regardless of what `grace_days` is set to today — a seed plan is
    // validated once, at registration, long before any request has
    // resolved the setting that could make a too-long pass briefly legal.
    expect(() =>
      parseDuesConfig(
        config({ plans: [{ ...FIXED, billing: { mode: 'fixed', period: 'P703D' } }] }),
      ),
    ).toThrow(/two years/)

    expect(() =>
      parseDuesConfig(
        config({ plans: [{ ...FIXED, billing: { mode: 'fixed', period: 'P702D' } }] }),
      ),
    ).not.toThrow()
  })

  it('seeds are optional — a board may open its shop from the panel alone', () => {
    const parsed = parseDuesConfig({})
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

describe('resolveDuesConfig', () => {
  const staticConfig = parseDuesConfig({ label: 'Supporters' })

  it('falls back to the defaults when no setting has a value', () => {
    const resolved = resolveDuesConfig(staticConfig, {})
    expect(resolved.currency).toBe(DEFAULT_CURRENCY)
    expect(resolved.graceDays).toBe(DEFAULT_GRACE_DAYS)
    expect(resolved.label).toBe('Supporters')
  })

  it('carries the resolved settings values through', () => {
    const resolved = resolveDuesConfig(staticConfig, { currency: 'GBP', grace_days: 14 })
    expect(resolved.currency).toBe('gbp')
    expect(resolved.graceDays).toBe(14)
  })

  it('clamps an out-of-range grace period rather than refusing it', () => {
    expect(resolveDuesConfig(staticConfig, { grace_days: 90 }).graceDays).toBe(MAX_GRACE_DAYS)
    expect(resolveDuesConfig(staticConfig, { grace_days: -5 }).graceDays).toBe(0)
    expect(resolveDuesConfig(staticConfig, { grace_days: 'not-a-number' }).graceDays).toBe(
      DEFAULT_GRACE_DAYS,
    )
  })

  it('falls back to the default currency rather than an unrecognised value', () => {
    expect(resolveDuesConfig(staticConfig, { currency: 'not-a-code' }).currency).toBe(
      DEFAULT_CURRENCY,
    )
  })
})

describe('DUES_CURRENCY through the real settings pipeline', () => {
  const staticConfig = parseDuesConfig({ label: 'Supporters' })
  const none = new Map<string, string>()

  function envFor(value: string) {
    return (name: string) => (name === 'DUES_CURRENCY' ? value : undefined)
  }

  it('an upper-case ISO code still resolves, not the default', () => {
    const settings = resolvePluginSettings(dues, none, envFor('EUR'))
    expect(resolveDuesConfig(staticConfig, settings).currency).toBe('eur')
  })

  it('tolerates surrounding whitespace', () => {
    const settings = resolvePluginSettings(dues, none, envFor(' eur '))
    expect(resolveDuesConfig(staticConfig, settings).currency).toBe('eur')
  })

  it('a genuinely invalid code still falls back to the default', () => {
    const settings = resolvePluginSettings(dues, none, envFor('XYZ'))
    expect(resolveDuesConfig(staticConfig, settings).currency).toBe(DEFAULT_CURRENCY)
  })
})
