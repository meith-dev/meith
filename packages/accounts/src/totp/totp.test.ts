import { describe, expect, it } from 'vitest'

import { decodeBase32, encodeBase32, isBase32 } from './base32'
import {
  TOTP_PERIOD_SECONDS,
  generateTotpSecret,
  matchTotp,
  otpauthUri,
  stepAt,
  totpCode,
} from './totp'

/** RFC 4648 section 10. */
describe('base32', () => {
  it('matches the published vectors', () => {
    const cases: readonly [string, string][] = [
      ['', ''],
      ['f', 'MY'],
      ['fo', 'MZXQ'],
      ['foo', 'MZXW6'],
      ['foob', 'MZXW6YQ'],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI'],
    ]

    for (const [plain, encoded] of cases) {
      expect(encodeBase32(new TextEncoder().encode(plain))).toBe(encoded)
      expect(new TextDecoder().decode(decodeBase32(encoded))).toBe(plain)
    }
  })

  it('reads a secret however an authenticator app printed it', () => {
    expect([...decodeBase32('mzxw 6ytb-oi==')]).toEqual([...decodeBase32('MZXW6YTBOI')])
  })

  it('refuses characters outside the alphabet', () => {
    expect(isBase32('MZXW6YTB')).toBe(true)
    expect(isBase32('nope!')).toBe(false)
    expect(() => decodeBase32('0189')).toThrow()
  })
})

/**
 * RFC 6238 appendix B, the SHA-1 rows. The published secret is the ASCII
 * "12345678901234567890"; the vectors are eight digits, and this board issues
 * six, so each expectation is the last six of the published code.
 */
const RFC_SECRET = encodeBase32(new TextEncoder().encode('12345678901234567890'))

describe('the codes an authenticator app produces', () => {
  const vectors: readonly [number, string][] = [
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_111_111_111, '050471'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
    [20_000_000_000, '353130'],
  ]

  it('matches the published test vectors', async () => {
    for (const [seconds, expected] of vectors) {
      const step = Math.floor(seconds / TOTP_PERIOD_SECONDS)
      expect(await totpCode(RFC_SECRET, step), `at ${seconds}s`).toBe(expected)
    }
  })

  it('changes every thirty seconds and not within one', () => {
    expect(stepAt(new Date(0))).toBe(0)
    expect(stepAt(new Date(29_999))).toBe(0)
    expect(stepAt(new Date(30_000))).toBe(1)
  })
})

describe('taking a code from a member', () => {
  const at = new Date(1_111_111_109_000)

  it('accepts the code for the moment it is given', async () => {
    expect(await matchTotp({ secret: RFC_SECRET, code: '081804', at })).toEqual({
      step: stepAt(at),
    })
  })

  it('accepts one step either side, for a device whose clock has drifted', async () => {
    const previous = await totpCode(RFC_SECRET, stepAt(at) - 1)
    const next = await totpCode(RFC_SECRET, stepAt(at) + 1)

    expect(await matchTotp({ secret: RFC_SECRET, code: previous, at })).toEqual({
      step: stepAt(at) - 1,
    })
    expect(await matchTotp({ secret: RFC_SECRET, code: next, at })).toEqual({
      step: stepAt(at) + 1,
    })
  })

  it('refuses a code two steps out', async () => {
    const stale = await totpCode(RFC_SECRET, stepAt(at) - 2)
    expect(await matchTotp({ secret: RFC_SECRET, code: stale, at })).toBeNull()
  })

  it('ignores the spaces an app puts in the middle of a code', async () => {
    expect(await matchTotp({ secret: RFC_SECRET, code: '081 804', at })).not.toBeNull()
    expect(await matchTotp({ secret: RFC_SECRET, code: '081-804', at })).not.toBeNull()
  })

  it('refuses anything that is not six digits without touching the secret', async () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '08180a']) {
      expect(await matchTotp({ secret: RFC_SECRET, code, at })).toBeNull()
    }
  })

  it('refuses a code from a different secret', async () => {
    expect(
      await matchTotp({ secret: generateTotpSecret(), code: '081804', at }),
    ).toBeNull()
  })
})

describe('the secret an app is handed', () => {
  it('is fresh every time and long enough to be worth having', () => {
    const secret = generateTotpSecret()
    expect(decodeBase32(secret)).toHaveLength(20)
    expect(secret).not.toBe(generateTotpSecret())
  })

  it('goes into a URI an authenticator app understands', () => {
    const uri = new URL(
      otpauthUri({ secret: 'MZXW6YTBOI', account: 'ada@example.com', issuer: 'Ada’s board' }),
    )

    expect(uri.protocol).toBe('otpauth:')
    expect(uri.host).toBe('totp')
    expect(decodeURIComponent(uri.pathname)).toBe('/Ada’s board:ada@example.com')
    expect(uri.searchParams.get('secret')).toBe('MZXW6YTBOI')
    expect(uri.searchParams.get('issuer')).toBe('Ada’s board')
    expect(uri.searchParams.get('digits')).toBe('6')
    expect(uri.searchParams.get('period')).toBe('30')
  })

  it('names the board something rather than nothing', () => {
    const uri = new URL(otpauthUri({ secret: 'MZXW6YTBOI', account: 'ada', issuer: '  ' }))
    expect(uri.searchParams.get('issuer')).toBe('Meith')
  })
})
