import { describe, expect, it } from 'vitest'

import {
  addBillingInterval,
  addDays,
  addPeriod,
  describePeriod,
  parsePeriod,
  periodCeilingDays,
} from './period'

describe('parsePeriod', () => {
  it('reads the shapes plans use', () => {
    expect(parsePeriod('P90D')).toEqual({ years: 0, months: 0, weeks: 0, days: 90 })
    expect(parsePeriod('P1M')).toEqual({ years: 0, months: 1, weeks: 0, days: 0 })
    expect(parsePeriod('P1Y')).toEqual({ years: 1, months: 0, weeks: 0, days: 0 })
    expect(parsePeriod('P1Y2W3D')).toEqual({ years: 1, months: 0, weeks: 2, days: 3 })
  })

  it.each(['', 'P', 'P0D', '90D', 'PT1H', 'P1.5M', 'p90d'])('refuses %o', (spec) => {
    expect(parsePeriod(spec)).toBeNull()
  })
})

describe('addPeriod', () => {
  const at = (iso: string) => new Date(iso)

  it('adds days exactly', () => {
    expect(addPeriod(at('2026-01-01T12:00:00Z'), parsePeriod('P90D')!)).toEqual(
      at('2026-04-01T12:00:00Z'),
    )
  })

  it('follows the calendar for months, clamping at month end', () => {
    expect(addPeriod(at('2026-01-31T00:00:00Z'), parsePeriod('P1M')!)).toEqual(
      at('2026-02-28T00:00:00Z'),
    )
    expect(addPeriod(at('2028-01-31T00:00:00Z'), parsePeriod('P1M')!)).toEqual(
      at('2028-02-29T00:00:00Z'),
    )
    expect(addPeriod(at('2026-03-15T09:30:00Z'), parsePeriod('P1M')!)).toEqual(
      at('2026-04-15T09:30:00Z'),
    )
  })

  it('a year lands on the same date, leap day excepted', () => {
    expect(addPeriod(at('2026-06-01T00:00:00Z'), parsePeriod('P1Y')!)).toEqual(
      at('2027-06-01T00:00:00Z'),
    )
    expect(addPeriod(at('2028-02-29T00:00:00Z'), parsePeriod('P1Y')!)).toEqual(
      at('2029-02-28T00:00:00Z'),
    )
  })

  it('mixes parts: months first, then weeks and days', () => {
    expect(addPeriod(at('2026-01-31T00:00:00Z'), parsePeriod('P1M1W')!)).toEqual(
      at('2026-03-07T00:00:00Z'),
    )
  })
})

describe('the smaller helpers', () => {
  it('billing intervals are one calendar month or year', () => {
    expect(addBillingInterval(new Date('2026-01-31T00:00:00Z'), 'month')).toEqual(
      new Date('2026-02-28T00:00:00Z'),
    )
    expect(addBillingInterval(new Date('2026-05-01T00:00:00Z'), 'year')).toEqual(
      new Date('2027-05-01T00:00:00Z'),
    )
  })

  it('addDays is exact milliseconds', () => {
    expect(addDays(new Date('2026-01-01T00:00:00Z'), 7)).toEqual(
      new Date('2026-01-08T00:00:00Z'),
    )
  })

  it('ceiling over-estimates, never under', () => {
    expect(periodCeilingDays(parsePeriod('P1Y')!)).toBe(366)
    expect(periodCeilingDays(parsePeriod('P12M')!)).toBe(372)
    expect(periodCeilingDays(parsePeriod('P90D')!)).toBe(90)
  })

  it('describes periods the way a plan card should read', () => {
    expect(describePeriod(parsePeriod('P90D')!)).toBe('90 days')
    expect(describePeriod(parsePeriod('P1M')!)).toBe('1 month')
    expect(describePeriod(parsePeriod('P1Y2W')!)).toBe('1 year, 2 weeks')
  })
})
