/**
 * F29 — timestamp formatting.
 *
 * Every date on the board goes through `formatTime`, and its whole reason for
 * existing is that formatting must not depend on the machine running it. So the
 * cases that matter are the boundaries: midnight, year ends, and the two zones a
 * naive implementation would confuse.
 */

import { describe, expect, it } from 'vitest'

import { formatTime } from './time'

const NOW = new Date('2026-07-30T12:00:00Z')

describe('formatTime', () => {
  it('always carries the exact instant as ISO', () => {
    expect(formatTime(new Date('2026-07-30T09:14:00Z'), NOW).iso).toBe(
      '2026-07-30T09:14:00.000Z',
    )
  })

  it('names today and yesterday', () => {
    expect(formatTime(new Date('2026-07-30T09:14:00Z'), NOW).label).toBe('Today, 09:14')
    expect(formatTime(new Date('2026-07-29T23:59:00Z'), NOW).label).toBe(
      'Yesterday, 23:59',
    )
  })

  /*
   * One minute apart across midnight UTC. An implementation comparing elapsed
   * milliseconds rather than calendar days calls both "Today", which is how a
   * board ends up claiming a post from last night was made this morning.
   */
  it('changes day at midnight, not 24 hours back', () => {
    expect(formatTime(new Date('2026-07-30T00:01:00Z'), NOW).label).toBe('Today, 00:01')
    expect(formatTime(new Date('2026-07-29T23:59:00Z'), NOW).label).toBe(
      'Yesterday, 23:59',
    )
  })

  it('gives older dates in the current year a day and month', () => {
    expect(formatTime(new Date('2026-03-12T08:05:00Z'), NOW).label).toBe(
      '12 Mar, 08:05',
    )
  })

  /*
   * A post from last March rendering as "12 Mar" reads as recent. The ambiguity
   * is invisible, which is why the year is only ever dropped for the current one.
   */
  it('keeps the year for anything older', () => {
    expect(formatTime(new Date('2025-03-12T08:05:00Z'), NOW).label).toBe('12 Mar 2025')
  })

  it('pads hours and minutes', () => {
    expect(formatTime(new Date('2026-07-30T04:07:00Z'), NOW).label).toBe('Today, 04:07')
  })

  /*
   * "Yesterday" across a year boundary is the case an implementation that
   * compares day-of-month gets wrong.
   */
  it('handles yesterday across a year boundary', () => {
    const newYear = new Date('2027-01-01T10:00:00Z')

    expect(formatTime(new Date('2026-12-31T22:00:00Z'), newYear).label).toBe(
      'Yesterday, 22:00',
    )
  })

  /*
   * The formatter must be a pure function of its two arguments: same inputs,
   * same output, on any host in any zone. This is the property the whole design
   * rests on, and the one that a stray `toLocaleString` would break silently on
   * every machine except the one it was written on.
   */
  it('is independent of the host timezone', () => {
    const at = new Date('2026-07-30T23:30:00Z')
    const original = process.env.TZ

    try {
      process.env.TZ = 'Pacific/Kiritimati' // UTC+14: already tomorrow locally.
      const far = formatTime(at, NOW).label
      process.env.TZ = 'Pacific/Niue' // UTC-11: still yesterday locally.
      const near = formatTime(at, NOW).label

      expect(far).toBe('Today, 23:30')
      expect(near).toBe(far)
    } finally {
      process.env.TZ = original
    }
  })
})
