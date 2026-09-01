import { describe, expect, it } from 'vitest'

import { cronCadenceSeconds, nextRun, parseCron } from './cron'

function iso(date: Date): string {
  return date.toISOString().replace(/\.000Z$/, 'Z')
}

function runAfter(expression: string, from: string): string {
  return iso(nextRun(parseCron(expression), new Date(from)))
}

describe('parseCron', () => {
  it('accepts the five standard fields', () => {
    expect(() => parseCron('0 9 * * 1')).not.toThrow()
    expect(() => parseCron('*/5 * * * *')).not.toThrow()
    expect(() => parseCron('15,45 0-6 1-15 */2 1-5')).not.toThrow()
  })

  it('rejects a six-field expression as sub-minute', () => {
    expect(() => parseCron('0 0 9 * * 1')).toThrow(/sixth field/)
    expect(() => parseCron('*/30 * * * * *')).toThrow(/faster than once a minute/)
  })

  it('rejects fewer than five fields', () => {
    expect(() => parseCron('0 9 * *')).toThrow(/five fields/)
    expect(() => parseCron('')).toThrow(/empty schedule/)
  })

  it('rejects values outside a field range', () => {
    expect(() => parseCron('60 * * * *')).toThrow(/minute/)
    expect(() => parseCron('* 24 * * *')).toThrow(/hour/)
    expect(() => parseCron('* * 0 * *')).toThrow(/day-of-month/)
    expect(() => parseCron('* * * 13 *')).toThrow(/month/)
    expect(() => parseCron('* * * * 8')).toThrow(/day-of-week/)
  })

  it('rejects month and weekday names, which it does not speak', () => {
    expect(() => parseCron('0 9 * * MON')).toThrow(/whole number/)
    expect(() => parseCron('0 9 * JAN *')).toThrow(/whole number/)
  })

  it('rejects an inverted range and a zero step', () => {
    expect(() => parseCron('10-5 * * * *')).toThrow(/minute/)
    expect(() => parseCron('*/0 * * * *')).toThrow(/step/)
  })

  it('treats Sunday as both 0 and 7', () => {
    const zero = parseCron('0 0 * * 0')
    const seven = parseCron('0 0 * * 7')
    expect(nextRun(zero, new Date('2026-01-01T00:00:00Z')).toISOString()).toBe(
      nextRun(seven, new Date('2026-01-01T00:00:00Z')).toISOString(),
    )
  })
})

describe('nextRun', () => {
  it('finds the next matching minute strictly after the given time', () => {
    expect(runAfter('30 14 * * *', '2026-03-10T14:00:00Z')).toBe('2026-03-10T14:30:00Z')
    expect(runAfter('30 14 * * *', '2026-03-10T14:30:00Z')).toBe('2026-03-11T14:30:00Z')
  })

  it('lands on the right weekday, evaluated in UTC', () => {
    expect(runAfter('0 9 * * 1', '2026-08-31T09:00:00Z')).toBe('2026-09-07T09:00:00Z')
    expect(runAfter('0 9 * * 1', '2026-09-01T00:00:00Z')).toBe('2026-09-07T09:00:00Z')
  })

  it('is a non-issue across a daylight-saving boundary because it anchors to UTC', () => {
    const springForward = runAfter('30 2 * * *', '2026-03-08T00:00:00Z')
    expect(springForward).toBe('2026-03-08T02:30:00Z')

    const fallBack = runAfter('30 1 * * *', '2026-11-01T00:00:00Z')
    expect(fallBack).toBe('2026-11-01T01:30:00Z')

    const daily = parseCron('0 0 * * *')
    let cursor = new Date('2026-03-07T12:00:00Z')
    const gaps: number[] = []
    for (let i = 0; i < 3; i++) {
      const next = nextRun(daily, cursor)
      gaps.push(next.getTime() - cursor.getTime())
      cursor = next
    }
    expect(gaps).toEqual([43_200_000, 86_400_000, 86_400_000])
  })

  it('rolls across a month and year boundary', () => {
    expect(runAfter('0 0 1 * *', '2026-12-15T00:00:00Z')).toBe('2027-01-01T00:00:00Z')
  })

  it('unions day-of-month and day-of-week when both are restricted', () => {
    const both = parseCron('0 0 13 * 5')
    expect(iso(nextRun(both, new Date('2026-11-01T00:00:00Z')))).toBe('2026-11-06T00:00:00Z')
    expect(iso(nextRun(both, new Date('2026-11-06T00:00:01Z')))).toBe('2026-11-13T00:00:00Z')
  })
})

describe('cronCadenceSeconds', () => {
  it('measures the gap between consecutive runs', () => {
    const from = new Date('2026-01-01T00:00:00Z')
    expect(cronCadenceSeconds(parseCron('*/5 * * * *'), from)).toBe(300)
    expect(cronCadenceSeconds(parseCron('0 * * * *'), from)).toBe(3600)
    expect(cronCadenceSeconds(parseCron('0 0 * * *'), from)).toBe(86_400)
    expect(cronCadenceSeconds(parseCron('0 9 * * 1'), from)).toBe(604_800)
  })

  it('never reports a cadence under the minute floor', () => {
    expect(cronCadenceSeconds(parseCron('* * * * *'))).toBe(60)
  })
})
