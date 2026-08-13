import { describe, expect, it } from 'vitest'

import { AUTOMATIC_TIMEZONE } from '@meith/accounts'

import { DEFAULT_TIMEZONE } from './time'
import { detectedTimezone, resolveTimezone } from './timezone'

describe('detectedTimezone', () => {
  it('takes an IANA name the runtime knows', () => {
    expect(detectedTimezone('Europe/Berlin')).toBe('Europe/Berlin')
    expect(detectedTimezone('UTC')).toBe('UTC')
  })

  it('refuses anything the runtime cannot format with', () => {
    expect(detectedTimezone('Middle/Earth')).toBeNull()
    expect(detectedTimezone('+01:00')).toBeNull()
    expect(detectedTimezone('')).toBeNull()
    expect(detectedTimezone(null)).toBeNull()
    expect(detectedTimezone(undefined)).toBeNull()
  })

  it('refuses the sentinel, which names no zone', () => {
    expect(detectedTimezone(AUTOMATIC_TIMEZONE)).toBeNull()
  })
})

describe('resolveTimezone', () => {
  it('gives a guest the zone their browser reported', () => {
    expect(resolveTimezone({ detected: 'Asia/Tokyo' })).toEqual({
      zone: 'Asia/Tokyo',
      isAutomatic: true,
    })
  })

  it('falls back to UTC when nothing has reported a zone yet', () => {
    expect(resolveTimezone({})).toEqual({ zone: DEFAULT_TIMEZONE, isAutomatic: true })
  })

  it('prefers a chosen zone over the browser', () => {
    expect(
      resolveTimezone({ stored: 'America/New_York', detected: 'Asia/Tokyo' }),
    ).toEqual({ zone: 'America/New_York', isAutomatic: false })
  })

  it('keeps a chosen UTC as a choice, not as an absence', () => {
    expect(resolveTimezone({ stored: 'UTC', detected: 'Asia/Tokyo' })).toEqual({
      zone: 'UTC',
      isAutomatic: false,
    })
  })

  it('reads the automatic preference as no choice at all', () => {
    expect(
      resolveTimezone({ stored: AUTOMATIC_TIMEZONE, detected: 'Asia/Tokyo' }),
    ).toEqual({ zone: 'Asia/Tokyo', isAutomatic: true })
  })

  it('ignores a stored zone the runtime no longer recognises', () => {
    expect(resolveTimezone({ stored: 'Middle/Earth', detected: 'Asia/Tokyo' })).toEqual({
      zone: 'Asia/Tokyo',
      isAutomatic: true,
    })
  })
})
