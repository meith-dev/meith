import { describe, expect, it } from 'vitest'

import { dayKey, dayRange, isDayKey, retentionCutoff, shiftDay } from './day'
import { DEFAULT_RANGE, analyticsTotals, fillDays, rangeChoice } from './summary'

describe('dayRange', () => {
  it('ends on the day asked for and counts back', () => {
    expect(dayRange({ to: '2026-08-17', days: 3 })).toEqual([
      '2026-08-15',
      '2026-08-16',
      '2026-08-17',
    ])
  })

  it('crosses a month and a year', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('dayKey', () => {
  it('names the UTC day, whatever the hour', () => {
    expect(dayKey(new Date('2026-08-17T23:59:59Z'))).toBe('2026-08-17')
    expect(dayKey(new Date('2026-08-18T00:00:00Z'))).toBe('2026-08-18')
  })

  it('recognises its own keys and refuses a date that is not one', () => {
    expect(isDayKey('2026-08-17')).toBe(true)
    expect(isDayKey('2026-02-31')).toBe(false)
    expect(isDayKey('17/08/2026')).toBe(false)
  })
})

describe('retentionCutoff', () => {
  it('keeps the retention window and cuts everything before it', () => {
    expect(
      retentionCutoff({ now: new Date('2026-08-17T12:00:00Z'), retentionDays: 90 }),
    ).toBe('2026-05-19')
  })

  it('never cuts the day in progress', () => {
    expect(
      retentionCutoff({ now: new Date('2026-08-17T12:00:00Z'), retentionDays: 0 }),
    ).toBe('2026-08-16')
  })
})

describe('rangeChoice', () => {
  it('takes one of the offered ranges and otherwise the default', () => {
    expect(rangeChoice('7')).toBe(7)
    expect(rangeChoice('90')).toBe(90)
    expect(rangeChoice('1000')).toBe(DEFAULT_RANGE)
    expect(rangeChoice(undefined)).toBe(DEFAULT_RANGE)
  })
})

describe('fillDays', () => {
  it('gives a day with nothing recorded a row of zeroes', () => {
    const filled = fillDays({
      to: '2026-08-17',
      days: 3,
      recorded: [
        { day: '2026-08-16', views: 4, memberViews: 1, visitors: 2, memberVisitors: 1 },
      ],
    })

    expect(filled.map((row) => [row.day, row.views])).toEqual([
      ['2026-08-15', 0],
      ['2026-08-16', 4],
      ['2026-08-17', 0],
    ])
  })
})

describe('analyticsTotals', () => {
  it('adds the range up and separates members from guests', () => {
    const totals = analyticsTotals([
      { day: '2026-08-16', views: 10, memberViews: 4, visitors: 5, memberVisitors: 2 },
      { day: '2026-08-17', views: 6, memberViews: 1, visitors: 3, memberVisitors: 1 },
    ])

    expect(totals.views).toBe(16)
    expect(totals.guestViews).toBe(11)
    expect(totals.visitors).toBe(8)
    expect(totals.guestVisitors).toBe(5)
    expect(totals.busiestDay?.day).toBe('2026-08-16')
  })

  it('has no busiest day when nothing was recorded', () => {
    expect(analyticsTotals([]).busiestDay).toBeNull()
    expect(
      analyticsTotals([
        { day: '2026-08-17', views: 0, memberViews: 0, visitors: 0, memberVisitors: 0 },
      ]).busiestDay,
    ).toBeNull()
  })
})
