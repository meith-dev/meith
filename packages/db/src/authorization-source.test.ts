import { describe, expect, it } from 'vitest'

import { parseAncestorPath } from './authorization-source'

describe('parseAncestorPath', () => {
  it('parses a deep path nearest-first, inclusive of self', () => {
    // '1.4.9.12' is Category > Community > Subcommunity > Sub-subcommunity. The resolver's
    // "first non-null wins" walk needs the row's own id first, root last.
    expect(parseAncestorPath('1.4.9.12')).toEqual([12, 9, 4, 1])
  })

  it('parses a root path to a single id', () => {
    expect(parseAncestorPath('1')).toEqual([1])
  })

  it('ignores empty and non-numeric segments rather than yielding NaN', () => {
    // Defensive: a malformed path must not inject NaN into the group/community id
    // sets, which would silently match nothing (or everything) downstream.
    expect(parseAncestorPath('1..4')).toEqual([4, 1])
    expect(parseAncestorPath('')).toEqual([])
    expect(parseAncestorPath('1.x.4')).toEqual([4, 1])
  })

  it('is the exact order the fixture chains use', () => {
    // Mirrors MemoryAuthorizationSource CHAINS: [self, ...ancestors]. If these
    // two diverged, Postgres and fixture would resolve inheritance differently.
    expect(parseAncestorPath('1.4')).toEqual([4, 1])
  })
})
