import { describe, expect, it } from 'vitest'

import { bearerSecret, secretMatches } from './secret-auth'

describe('secretMatches', () => {
  it('matches identical secrets', () => {
    expect(secretMatches('a-secret', 'a-secret')).toBe(true)
  })

  it('refuses a secret that differs', () => {
    expect(secretMatches('a-secret', 'another-secret')).toBe(false)
  })

  it('refuses a secret of a different length without throwing', () => {
    expect(secretMatches('short', 'a-much-longer-secret')).toBe(false)
  })

  it('refuses an empty presented value against a real secret', () => {
    expect(secretMatches('', 'a-secret')).toBe(false)
  })
})

describe('bearerSecret', () => {
  const HEADER = 'x-example-token'

  it('reads a bearer token from the authorization header', () => {
    const request = new Request('https://example.com', {
      headers: { authorization: 'Bearer the-token' },
    })
    expect(bearerSecret(request, HEADER)).toBe('the-token')
  })

  it('reads the scheme case-insensitively', () => {
    const request = new Request('https://example.com', {
      headers: { authorization: 'bearer the-token' },
    })
    expect(bearerSecret(request, HEADER)).toBe('the-token')
  })

  it('falls back to the dedicated header when authorization is absent', () => {
    const request = new Request('https://example.com', { headers: { [HEADER]: 'the-token' } })
    expect(bearerSecret(request, HEADER)).toBe('the-token')
  })

  it('ignores an authorization header using a different scheme', () => {
    const request = new Request('https://example.com', {
      headers: { authorization: 'Basic dXNlcjpwYXNz', [HEADER]: 'the-token' },
    })
    expect(bearerSecret(request, HEADER)).toBe('the-token')
  })

  it('returns an empty string when nothing was presented', () => {
    const request = new Request('https://example.com')
    expect(bearerSecret(request, HEADER)).toBe('')
  })
})
