import { describe, expect, it } from 'vitest'

import { generateToken, hashToken, timingSafeEqual } from './tokens'

describe('generateToken', () => {
  it('is 64 lowercase hex chars (256 bits)', () => {
    const t = generateToken()
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is unique across many draws', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(generateToken())
    expect(seen.size).toBe(1000)
  })
})

describe('hashToken', () => {
  it('is a stable SHA-256 digest', async () => {
    const t = generateToken()
    expect(await hashToken(t)).toBe(await hashToken(t))
  })

  it('is a 64-char hex digest that differs from the plaintext', async () => {
    const t = generateToken()
    const h = await hashToken(t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toBe(t)
  })

  it('has a known digest for a known input', async () => {
    expect(await hashToken('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
})

describe('timingSafeEqual', () => {
  it('is true for equal strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true)
  })

  it('is false for different strings of equal length', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false)
  })

  it('is false for different lengths', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})
