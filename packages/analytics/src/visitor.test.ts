import { describe, expect, it } from 'vitest'

import { VISITOR_KEY_LENGTH, connectorClientId, visitorIdentity, visitorKey } from './visitor'

describe('visitorIdentity', () => {
  it('prefers the account over the guest cookie', () => {
    expect(visitorIdentity({ userId: 7, guestToken: 'abc' })).toEqual({
      subject: 'u:7',
      member: true,
    })
  })

  it('falls back to the guest cookie', () => {
    expect(visitorIdentity({ userId: null, guestToken: 'abc' })).toEqual({
      subject: 'g:abc',
      member: false,
    })
  })

  it('has nothing to count when a reader keeps no cookie', () => {
    expect(visitorIdentity({ userId: null, guestToken: null })).toBeNull()
    expect(visitorIdentity({ userId: null, guestToken: '   ' })).toBeNull()
  })
})

describe('visitorKey', () => {
  const salt = 'a-board-secret'

  it('is stable for one reader on one day', () => {
    const first = visitorKey({ subject: 'g:abc', day: '2026-08-17', salt })
    const second = visitorKey({ subject: 'g:abc', day: '2026-08-17', salt })

    expect(first).toBe(second)
    expect(first).toHaveLength(VISITOR_KEY_LENGTH)
  })

  it('cannot be followed from one day to the next', () => {
    expect(visitorKey({ subject: 'g:abc', day: '2026-08-17', salt })).not.toBe(
      visitorKey({ subject: 'g:abc', day: '2026-08-18', salt })
    )
  })

  it('differs between readers, and between boards', () => {
    expect(visitorKey({ subject: 'g:abc', day: '2026-08-17', salt })).not.toBe(
      visitorKey({ subject: 'g:def', day: '2026-08-17', salt })
    )
    expect(visitorKey({ subject: 'g:abc', day: '2026-08-17', salt })).not.toBe(
      visitorKey({ subject: 'g:abc', day: '2026-08-17', salt: 'other' })
    )
  })

  it('keeps nothing of the token it was given', () => {
    expect(visitorKey({ subject: 'g:abc', day: '2026-08-17', salt })).not.toContain('abc')
  })
})

describe('connectorClientId', () => {
  it('reads as a Google client id and does not rotate daily', () => {
    const id = connectorClientId({ subject: 'g:abc', salt: 'secret' })

    expect(id).toMatch(/^\d{1,10}\.\d{1,10}$/)
    expect(connectorClientId({ subject: 'g:abc', salt: 'secret' })).toBe(id)
    expect(connectorClientId({ subject: 'g:def', salt: 'secret' })).not.toBe(id)
  })
})
