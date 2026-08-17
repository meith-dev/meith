import { describe, expect, it } from 'vitest'

import {
  CODE_ALPHABET,
  codeProblem,
  discountedPrice,
  generateCode,
  normalizeCode,
  type UsableCode,
  validCodeShape,
} from './codes'

describe('generateCode', () => {
  it('makes a readable XXXX-XXXX code from the unambiguous alphabet', () => {
    for (let round = 0; round < 20; round += 1) {
      const code = generateCode()
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      for (const letter of code.replace('-', '')) {
        expect(CODE_ALPHABET).toContain(letter)
      }
      expect(code).not.toMatch(/[OIL01]/)
    }
  })

  it('two calls almost never collide', () => {
    const seen = new Set(Array.from({ length: 50 }, generateCode))
    expect(seen.size).toBeGreaterThan(45)
  })
})

describe('code shapes', () => {
  it('normalizes to upper case and trims', () => {
    expect(normalizeCode('  launch50 ')).toBe('LAUNCH50')
  })

  it('accepts human codes and refuses junk', () => {
    expect(validCodeShape('LAUNCH50')).toBe(true)
    expect(validCodeShape('AB2')).toBe(true)
    expect(validCodeShape('WXYZ-2345')).toBe(true)
    expect(validCodeShape('AB')).toBe(false)
    expect(validCodeShape('-LEADING')).toBe(false)
    expect(validCodeShape('HAS SPACE')).toBe(false)
    expect(validCodeShape('X'.repeat(33))).toBe(false)
  })
})

describe('discountedPrice', () => {
  it('takes the percentage off in minor units, rounding to the nearest', () => {
    expect(discountedPrice(1200, 50)).toBe(600)
    expect(discountedPrice(1200, 100)).toBe(0)
    expect(discountedPrice(1200, 1)).toBe(1188)
    expect(discountedPrice(999, 33)).toBe(669)
    expect(discountedPrice(1, 50)).toBe(1)
  })
})

describe('codeProblem', () => {
  const now = new Date('2026-08-11T12:00:00Z')
  const base: UsableCode = {
    percentOff: 50,
    planKey: null,
    maxRedemptions: null,
    redeemedCount: 0,
    expiresAt: null,
    disabled: false,
  }

  it('a plain live code has no problem on any plan', () => {
    expect(codeProblem(base, 'pass-90', now)).toBeNull()
  })

  it('disabled wins over everything', () => {
    expect(codeProblem({ ...base, disabled: true }, 'pass-90', now)).toBe('disabled')
  })

  it('expiry is checked against now', () => {
    expect(
      codeProblem({ ...base, expiresAt: new Date('2026-08-11T11:59:59Z') }, 'pass-90', now),
    ).toBe('expired')
    expect(
      codeProblem({ ...base, expiresAt: new Date('2026-08-11T12:00:01Z') }, 'pass-90', now),
    ).toBeNull()
  })

  it('a cap counts settled redemptions', () => {
    expect(codeProblem({ ...base, maxRedemptions: 3, redeemedCount: 2 }, 'x', now)).toBeNull()
    expect(codeProblem({ ...base, maxRedemptions: 3, redeemedCount: 3 }, 'x', now)).toBe(
      'exhausted',
    )
  })

  it('a plan-locked code works there and nowhere else', () => {
    const locked = { ...base, planKey: 'pass-90' }
    expect(codeProblem(locked, 'pass-90', now)).toBeNull()
    expect(codeProblem(locked, 'supporter-month', now)).toBe('wrong-plan')
  })
})
