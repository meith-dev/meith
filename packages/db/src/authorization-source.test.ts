import { describe, expect, it } from 'vitest'

import { parseAncestorPath } from './authorization-source'

describe('parseAncestorPath', () => {
  it('parses a deep path nearest-first, inclusive of self', () => {
    expect(parseAncestorPath('1.4.9.12')).toEqual([12, 9, 4, 1])
  })

  it('parses a root path to a single id', () => {
    expect(parseAncestorPath('1')).toEqual([1])
  })

  it('ignores empty and non-numeric segments rather than yielding NaN', () => {
    expect(parseAncestorPath('1..4')).toEqual([4, 1])
    expect(parseAncestorPath('')).toEqual([])
    expect(parseAncestorPath('1.x.4')).toEqual([4, 1])
  })

  it('is the exact order the fixture chains use', () => {
    expect(parseAncestorPath('1.4')).toEqual([4, 1])
  })
})
