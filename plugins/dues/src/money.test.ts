import { describe, expect, it } from 'vitest'

import {
  formatMinor,
  isCurrencyCode,
  isValidMinorAmount,
  isZeroDecimal,
  moneyMatches,
} from './money'

describe('formatMinor', () => {
  it('formats decimal currencies from minor units', () => {
    expect(formatMinor(500, 'gbp')).toBe('£5.00')
    expect(formatMinor(1250, 'eur')).toBe('€12.50')
    expect(formatMinor(99, 'usd')).toBe('$0.99')
  })

  it('keeps zero-decimal currencies whole', () => {
    expect(formatMinor(500, 'jpy')).toBe('¥500')
    expect(isZeroDecimal('JPY')).toBe(true)
    expect(isZeroDecimal('gbp')).toBe(false)
  })

  it('formats a refund as a negative amount', () => {
    expect(formatMinor(-500, 'gbp')).toBe('-£5.00')
  })

  it('survives an unknown code without throwing', () => {
    expect(formatMinor(500, 'zzz')).toContain('ZZZ')
  })
})

describe('validation helpers', () => {
  it('accepts three-letter codes only', () => {
    expect(isCurrencyCode('GBP')).toBe(true)
    expect(isCurrencyCode('gb')).toBe(false)
    expect(isCurrencyCode('gbpx')).toBe(false)
  })

  it('accepts positive integers only as minor amounts', () => {
    expect(isValidMinorAmount(500)).toBe(true)
    expect(isValidMinorAmount(0)).toBe(false)
    expect(isValidMinorAmount(-5)).toBe(false)
    expect(isValidMinorAmount(5.5)).toBe(false)
    expect(isValidMinorAmount('500')).toBe(false)
  })
})

describe('moneyMatches', () => {
  const expected = { amountMinor: 500, currency: 'gbp' }

  it('requires the amount and the currency to both agree', () => {
    expect(moneyMatches(expected, { amountMinor: 500, currency: 'gbp' })).toBe(true)
    expect(moneyMatches(expected, { amountMinor: 500, currency: 'GBP' })).toBe(true)
    expect(moneyMatches(expected, { amountMinor: 499, currency: 'gbp' })).toBe(false)
    expect(moneyMatches(expected, { amountMinor: 500, currency: 'eur' })).toBe(false)
    expect(moneyMatches(expected, { amountMinor: null, currency: 'gbp' })).toBe(false)
    expect(moneyMatches(expected, { amountMinor: 500, currency: null })).toBe(false)
  })
})
