import { describe, expect, it } from 'vitest'

import { compareSemver, parseMeithRange, satisfiesMeithRange } from './range'

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareSemver('1.1.0', '1.0.9')).toBeGreaterThan(0)
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0)
  })
})

describe('parseMeithRange', () => {
  it('parses a single comparator with a default operator of "="', () => {
    expect(parseMeithRange('1')).toEqual([{ op: '=', parts: [1] }])
  })

  it('parses a space-separated AND of comparators', () => {
    expect(parseMeithRange('>=0.16 <1')).toEqual([
      { op: '>=', parts: [0, 16] },
      { op: '<', parts: [1] },
    ])
  })

  it('rejects an empty or malformed range', () => {
    expect(parseMeithRange('')).toBeNull()
    expect(parseMeithRange('not a range')).toBeNull()
    expect(parseMeithRange('~1.2')).toBeNull()
  })
})

describe('satisfiesMeithRange', () => {
  it('matches the real seeded range against the real seeded version', () => {
    expect(satisfiesMeithRange('>=0.16 <1', '0.16.0')).toBe(true)
  })

  it('fails once the board moves past the upper bound', () => {
    expect(satisfiesMeithRange('>=0.16 <1', '1.0.0')).toBe(false)
  })

  it('fails before the lower bound', () => {
    expect(satisfiesMeithRange('>=0.16 <1', '0.15.9')).toBe(false)
  })

  it('"=1" pins to the major and ignores minor and patch', () => {
    expect(satisfiesMeithRange('=1', '1.9.3')).toBe(true)
    expect(satisfiesMeithRange('=1', '2.0.0')).toBe(false)
  })

  it('"=1.2" pins to major and minor', () => {
    expect(satisfiesMeithRange('=1.2', '1.2.9')).toBe(true)
    expect(satisfiesMeithRange('=1.2', '1.3.0')).toBe(false)
  })

  it('">1.2" is satisfied by a later patch of the same minor, not only a later minor', () => {
    expect(satisfiesMeithRange('>1.2', '1.2.5')).toBe(true)
    expect(satisfiesMeithRange('>1.2', '1.2.0')).toBe(false)
  })

  it('never satisfies an unparseable range or version', () => {
    expect(satisfiesMeithRange('~1.2', '1.2.0')).toBe(false)
    expect(satisfiesMeithRange('>=1', 'not-a-version')).toBe(false)
  })
})
