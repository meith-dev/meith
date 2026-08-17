import { describe, expect, it } from 'vitest'

import { decodeBase64Url, decodeBase64UrlText, encodeBase64Url, randomBase64Url } from './base64url'

describe('base64url', () => {
  it('round-trips every byte length up to three padding cases', () => {
    for (let length = 0; length < 32; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37) % 256)
      expect([...decodeBase64Url(encodeBase64Url(bytes))]).toEqual([...bytes])
    }
  })

  it('emits no padding and no characters that need escaping in a URL', () => {
    const encoded = encodeBase64Url(Uint8Array.from([251, 255, 191, 0, 16]))
    expect(encoded).not.toContain('=')
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('accepts the padded, non-URL alphabet a provider might send back', () => {
    expect([...decodeBase64Url('+/8=')]).toEqual([...decodeBase64Url('-_8')])
  })

  it('decodes text', () => {
    expect(decodeBase64UrlText(encodeBase64Url(new TextEncoder().encode('héllo')))).toBe('héllo')
  })

  it('refuses input outside the alphabet', () => {
    expect(() => decodeBase64Url('abc$')).toThrow()
  })

  it('draws distinct random values of the requested length', () => {
    const first = randomBase64Url(32)
    expect(decodeBase64Url(first)).toHaveLength(32)
    expect(first).not.toBe(randomBase64Url(32))
  })
})
