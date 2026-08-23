import { describe, expect, it } from 'vitest'

import { createDues, dues } from './definition'

describe('the zero-argument export', () => {
  it('is constructible from the key alone — no constructor arguments required', () => {
    expect(dues.key).toBe('dues')
    // definePlugin() ran without throwing at module load, which is the real
    // assertion: a marketplace install can only ever write `plugin: dues`.
    expect(dues.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('declares currency and grace period as settings, not constructor input', () => {
    const byKey = new Map((dues.settings ?? []).map((setting) => [setting.key, setting]))

    const currency = byKey.get('currency')
    expect(currency?.type).toBe('select')
    expect(currency?.default).toBe('usd')
    expect(currency?.env).toBe('DUES_CURRENCY')
    expect((currency?.options ?? []).some((option) => option.value === 'gbp')).toBe(true)

    const graceDays = byKey.get('grace_days')
    expect(graceDays?.type).toBe('number')
    expect(graceDays?.default).toBe(7)
    expect(graceDays?.env).toBe('DUES_GRACE_DAYS')
  })

  it('ships only Stripe’s own redirect hosts — no board-configured host can reach it', () => {
    expect(dues.allowedRedirectHosts).toEqual(['checkout.stripe.com', 'billing.stripe.com'])
  })

  it('is exactly createDues() called with no arguments', () => {
    const explicit = createDues()
    expect(dues.key).toBe(explicit.key)
    expect(dues.settings).toEqual(explicit.settings)
    expect(dues.allowedRedirectHosts).toEqual(explicit.allowedRedirectHosts)
    expect(dues.pages?.map((page) => page.path)).toEqual(explicit.pages?.map((page) => page.path))
  })
})

describe('the code-configured path', () => {
  it('still accepts extra redirect hosts and seed plans', () => {
    const configured = createDues({
      extraRedirectHosts: ['127.0.0.1'],
      plans: [
        {
          key: 'pass-90',
          name: '90-day pass',
          group: 'supporters',
          price: 1200,
          billing: { mode: 'fixed', period: 'P90D' },
        },
      ],
    })

    expect(configured.allowedRedirectHosts).toEqual([
      'checkout.stripe.com',
      'billing.stripe.com',
      '127.0.0.1',
    ])
  })

  it('still refuses a bad configuration, exactly as the old constructor did', () => {
    expect(() => createDues({ label: '  ' })).toThrow(/label/)
  })
})
