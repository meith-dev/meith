import { describe, expect, it } from 'vitest'

import { formatDate, formatTime, timezoneLabel, untranslated } from './time'

const NOW = new Date('2026-07-30T12:00:00Z')

describe('formatTime', () => {
  it('always carries the exact instant as ISO', () => {
    expect(formatTime(new Date('2026-07-30T09:14:00Z'), NOW).iso).toBe('2026-07-30T09:14:00.000Z')
  })

  it('names today and yesterday', () => {
    expect(formatTime(new Date('2026-07-30T09:14:00Z'), NOW).label).toBe('Today, 09:14')
    expect(formatTime(new Date('2026-07-29T23:59:00Z'), NOW).label).toBe('Yesterday, 23:59')
  })

  it('changes day at midnight, not 24 hours back', () => {
    expect(formatTime(new Date('2026-07-30T00:01:00Z'), NOW).label).toBe('Today, 00:01')
    expect(formatTime(new Date('2026-07-29T23:59:00Z'), NOW).label).toBe('Yesterday, 23:59')
  })

  it('gives older dates in the current year a day and month', () => {
    expect(formatTime(new Date('2026-03-12T08:05:00Z'), NOW).label).toBe('12 Mar, 08:05')
  })

  it('keeps the year for anything older', () => {
    expect(formatTime(new Date('2025-03-12T08:05:00Z'), NOW).label).toBe('12 Mar 2025')
  })

  it('pads hours and minutes', () => {
    expect(formatTime(new Date('2026-07-30T04:07:00Z'), NOW).label).toBe('Today, 04:07')
  })

  it('handles yesterday across a year boundary', () => {
    const newYear = new Date('2027-01-01T10:00:00Z')

    expect(formatTime(new Date('2026-12-31T22:00:00Z'), newYear).label).toBe('Yesterday, 22:00')
  })

  it('is independent of the host timezone', () => {
    const at = new Date('2026-07-30T23:30:00Z')
    const original = process.env.TZ

    try {
      process.env.TZ = 'Pacific/Kiritimati'
      const far = formatTime(at, NOW).label
      process.env.TZ = 'Pacific/Niue'
      const near = formatTime(at, NOW).label

      expect(far).toBe('Today, 23:30')
      expect(near).toBe(far)
    } finally {
      process.env.TZ = original
    }
  })
})

describe('the viewer’s timezone', () => {
  const NOW = new Date('2026-07-31T12:00:00Z')

  it('formats in the zone it is given', () => {
    const at = new Date('2026-07-31T08:41:00Z')

    expect(formatTime(at, NOW, untranslated('UTC')).label).toBe('Today, 08:41')
    expect(formatTime(at, NOW, untranslated('Europe/London')).label).toBe('Today, 09:41')
    expect(formatTime(at, NOW, untranslated('Australia/Sydney')).label).toBe('Today, 18:41')
  })

  it('keeps the machine-readable value in UTC whatever the label says', () => {
    const at = new Date('2026-07-31T08:41:00Z')
    expect(formatTime(at, NOW, untranslated('Australia/Sydney')).iso).toBe(
      '2026-07-31T08:41:00.000Z',
    )
  })

  it('says "Today" by the viewer’s calendar, not by UTC’s', () => {
    const at = new Date('2026-07-30T23:30:00Z')
    const now = new Date('2026-07-31T00:30:00Z')

    expect(formatTime(at, now, untranslated('UTC')).label).toBe('Yesterday, 23:30')
    expect(formatTime(at, now, untranslated('Australia/Sydney')).label).toBe('Today, 09:30')
  })

  it('defaults to UTC, which is what every timestamp used before per-member timezones existed', () => {
    const at = new Date('2026-07-31T08:41:00Z')
    expect(formatTime(at, NOW).label).toBe(formatTime(at, NOW, untranslated('UTC')).label)
  })

  it('falls back to UTC for a zone the runtime has never heard of', () => {
    const at = new Date('2026-07-31T08:41:00Z')
    expect(formatTime(at, NOW, untranslated('Middle/Earth')).label).toBe('Today, 08:41')
  })

  it('names a zone the way the footer shows it', () => {
    expect(timezoneLabel('America/New_York')).toBe('America/New York')
    expect(timezoneLabel('UTC')).toBe('UTC')
  })
})

describe('formatDate', () => {
  it('carries the exact instant as ISO, like every other timestamp', () => {
    expect(formatDate(new Date('2026-03-12T09:14:00Z')).iso).toBe('2026-03-12T09:14:00.000Z')
  })

  it('never shows a time, not even a midnight one', () => {
    expect(formatDate(new Date('2026-01-01T00:00:00Z')).label).toBe('1 Jan 2026')
    expect(formatDate(new Date('2026-03-12T09:14:00Z')).label).toBe('12 Mar 2026')
  })

  it('keeps the year even for this year, unlike formatTime', () => {
    const thisYear = new Date('2026-03-12T09:14:00Z')

    expect(formatDate(thisYear).label).toBe('12 Mar 2026')
    expect(formatTime(thisYear, NOW).label).not.toContain('2026')
  })

  it('resolves the calendar day in the viewer’s zone', () => {
    const instant = new Date('2025-12-31T23:30:00Z')

    expect(formatDate(instant).label).toBe('31 Dec 2025')
    expect(formatDate(instant, untranslated('Pacific/Auckland')).label).toBe('1 Jan 2026')
  })

  it('falls back to UTC for a zone the runtime has never heard of', () => {
    expect(formatDate(new Date('2026-03-12T09:14:00Z'), untranslated('Mars/Olympus')).label).toBe(
      '12 Mar 2026',
    )
  })
})
