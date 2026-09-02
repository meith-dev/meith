import { describe, expect, it } from 'vitest'

import { mintUnsubscribeToken, readUnsubscribeToken, type UnsubscribeClaim } from './tokens'

const SECRET = 'a-board-secret-that-is-long-enough-32'
const OTHER = 'a-different-board-secret-32-chars!!!'

const CLAIM: UnsubscribeClaim = { userId: 7, scope: 'thread', targetId: 42 }

describe('a genuine token', () => {
  it('round-trips exactly what it was minted with', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET)
    expect(readUnsubscribeToken(token, SECRET)).toEqual(CLAIM)
  })

  it('round-trips the board-wide e-mail scope', () => {
    const claim: UnsubscribeClaim = { userId: 7, scope: 'email', targetId: 0 }
    const token = mintUnsubscribeToken(claim, SECRET)
    expect(readUnsubscribeToken(token, SECRET)).toEqual(claim)
  })

  it('round-trips the announcements scope', () => {
    const claim: UnsubscribeClaim = { userId: 7, scope: 'mass-mail', targetId: 0 }
    const token = mintUnsubscribeToken(claim, SECRET)
    expect(readUnsubscribeToken(token, SECRET)).toEqual(claim)
  })

  it('round-trips the board-digest scope', () => {
    const claim: UnsubscribeClaim = { userId: 7, scope: 'board-digest', targetId: 0 }
    const token = mintUnsubscribeToken(claim, SECRET)
    expect(readUnsubscribeToken(token, SECRET)).toEqual(claim)
  })

  it('is stable, so a link works for as long as the message exists', () => {
    expect(mintUnsubscribeToken(CLAIM, SECRET)).toBe(mintUnsubscribeToken(CLAIM, SECRET))
  })

  it('is different for every claim', () => {
    const other = mintUnsubscribeToken({ ...CLAIM, targetId: 43 }, SECRET)
    expect(other).not.toBe(mintUnsubscribeToken(CLAIM, SECRET))
  })

  it('survives being carried through a URL', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET)
    expect(token).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(encodeURIComponent(token)).toBe(token)
  })
})

describe('what it refuses', () => {
  it('a token signed with a different secret', () => {
    const token = mintUnsubscribeToken(CLAIM, OTHER)
    expect(readUnsubscribeToken(token, SECRET)).toBeNull()
  })

  it('a payload edited to point at somebody else', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET)
    const forged = token.replace('.7.', '.8.')
    expect(readUnsubscribeToken(forged, SECRET)).toBeNull()
  })

  it('a payload edited to point at another thread', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET)
    const forged = token.replace('.42.', '.43.')
    expect(readUnsubscribeToken(forged, SECRET)).toBeNull()
  })

  it('a scope swapped for the board-wide one', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET)
    expect(readUnsubscribeToken(token.replace('.thread.', '.email.'), SECRET)).toBeNull()
  })

  it('a target id on the scope that may not carry one', () => {
    const token = mintUnsubscribeToken({ userId: 7, scope: 'email', targetId: 0 }, SECRET)
    expect(readUnsubscribeToken(token.replace('.0.', '.5.'), SECRET)).toBeNull()
  })

  it('a target id on the announcements scope', () => {
    const token = mintUnsubscribeToken({ userId: 7, scope: 'mass-mail', targetId: 0 }, SECRET)
    expect(readUnsubscribeToken(token.replace('.0.', '.5.'), SECRET)).toBeNull()
  })

  it('a target id on the board-digest scope', () => {
    const token = mintUnsubscribeToken({ userId: 7, scope: 'board-digest', targetId: 0 }, SECRET)
    expect(readUnsubscribeToken(token.replace('.0.', '.5.'), SECRET)).toBeNull()
  })

  it('a truncated token', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET)
    expect(readUnsubscribeToken(token.slice(0, -4), SECRET)).toBeNull()
  })

  it('a token from a future version', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET).replace(/^v1\./, 'v2.')
    expect(readUnsubscribeToken(token, SECRET)).toBeNull()
  })

  it('anything that is not shaped like a token', () => {
    for (const value of ['', 'nonsense', 'v1.7.thread', 'v1.7.thread.42', '....']) {
      expect(readUnsubscribeToken(value, SECRET)).toBeNull()
    }
  })

  it('an unknown scope', () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET).replace('.thread.', '.account.')
    expect(readUnsubscribeToken(token, SECRET)).toBeNull()
  })

  it('a zero or negative user id', () => {
    for (const forged of ['v1.0.thread.42.x', 'v1.-1.thread.42.x']) {
      expect(readUnsubscribeToken(forged, SECRET)).toBeNull()
    }
  })
})
