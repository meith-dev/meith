import { describe, expect, it } from 'vitest'

import { formatDay, formatTimestamp } from './timestamp'
import { createTranslator, sourceTranslator, usableTimeZone } from './translator'

const EN = {
  'nav.home': 'Home',
  'thread.replies': '{count, plural, one {# reply} other {# replies}}',
  'thread.broken': '{count, plural, one {# reply}}',
  'time.day': '{day} {month} {year}',
  'time.hourCycle': 'h23',
  'time.past': '{day} {month} {year}',
  'time.thisYear': '{day} {month}, {time}',
  'time.today': 'Today, {time}',
  'time.yesterday': 'Yesterday, {time}',
}

describe('createTranslator', () => {
  const t = createTranslator({ locale: 'en', catalog: EN })

  it('renders a message from the catalog', () => {
    expect(t.t('thread.replies', { count: 3 })).toBe('3 replies')
  })

  it('returns the key for a message no catalog carries, so the gap is visible', () => {
    expect(t.t('thread.missing')).toBe('thread.missing')
    expect(t.has('thread.missing')).toBe(false)
  })

  it('falls back to the raw pattern rather than throwing on a broken message', () => {
    expect(t.t('thread.broken', { count: 2 })).toBe('{count, plural, one {# reply}}')
  })

  it('formats numbers and lists by its own locale', () => {
    const de = createTranslator({ locale: 'de', catalog: EN })

    expect(de.number(1234.5)).toBe('1.234,5')
    expect(de.list(['a', 'b', 'c'])).toBe('a, b und c')
  })

  it('names the plural category the locale actually uses', () => {
    expect(createTranslator({ locale: 'ru', catalog: EN }).plural(2)).toBe('few')
    expect(t.plural(2)).toBe('other')
  })
})

describe('usableTimeZone', () => {
  it('keeps a zone the runtime knows', () => {
    expect(usableTimeZone('Australia/Sydney')).toBe('Australia/Sydney')
  })

  it('falls back to UTC for anything else, rather than throwing at render time', () => {
    expect(usableTimeZone('Middle/Earth')).toBe('UTC')
    expect(usableTimeZone(null)).toBe('UTC')
    expect(usableTimeZone('')).toBe('UTC')
  })
})

describe('timestamps', () => {
  const NOW = new Date('2026-07-30T12:00:00Z')

  it('names today and yesterday from the catalog', () => {
    const t = sourceTranslator(EN)

    expect(formatTimestamp(new Date('2026-07-30T09:14:00Z'), NOW, t).label).toBe('Today, 09:14')
    expect(formatTimestamp(new Date('2026-07-29T23:59:00Z'), NOW, t).label).toBe('Yesterday, 23:59')
  })

  it('resolves the calendar day in the viewer’s zone, not the host’s', () => {
    const sydney = sourceTranslator(EN, 'Australia/Sydney')
    const at = new Date('2026-07-30T23:30:00Z')
    const now = new Date('2026-07-31T00:30:00Z')

    expect(formatTimestamp(at, now, sourceTranslator(EN)).label).toBe('Yesterday, 23:30')
    expect(formatTimestamp(at, now, sydney).label).toBe('Today, 09:30')
  })

  it('takes month names from the locale and the order from the catalog', () => {
    const german = createTranslator({
      locale: 'de',
      catalog: { ...EN, 'time.past': '{day}. {month} {year}' },
    })

    expect(formatTimestamp(new Date('2025-03-12T08:05:00Z'), NOW, german).label).toBe(
      '12. Mär 2025',
    )
    expect(formatTimestamp(new Date('2025-03-12T08:05:00Z'), NOW, sourceTranslator(EN)).label).toBe(
      '12 Mar 2025',
    )
  })

  it('follows the hour cycle the catalog asks for', () => {
    const twelve = createTranslator({ locale: 'en', catalog: { ...EN, 'time.hourCycle': 'h12' } })

    expect(formatTimestamp(new Date('2026-07-30T15:14:00Z'), NOW, twelve).label).toContain('03:14')
  })

  it('carries the exact instant as ISO whatever the label says', () => {
    const stamp = formatDay(new Date('2026-03-12T09:14:00Z'), sourceTranslator(EN))

    expect(stamp).toEqual({ iso: '2026-03-12T09:14:00.000Z', label: '12 Mar 2026' })
  })
})
