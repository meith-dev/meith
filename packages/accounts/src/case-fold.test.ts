import { describe, expect, it } from 'vitest'

import { foldIdentifier } from './case-fold'

describe('foldIdentifier', () => {
  it('folds case and trims surrounding whitespace', () => {
    expect(foldIdentifier('  Ivan  ')).toBe('ivan')
    expect(foldIdentifier('USER@Example.COM')).toBe('user@example.com')
  })

  /*
   * The reason this helper exists. `toLocaleLowerCase()` with no argument folds
   * using the *host's* default locale, so the same input yields different
   * identifiers on different machines. Turkish is the standard demonstration:
   * dotted capital I folds to a dotless ı.
   *
   * This asserts the hazard is real (so nobody "simplifies" the helper away) and
   * that foldIdentifier is immune to it. The textual guard F17
   * no-locale-case-fold is what actually prevents a regression, since a unit
   * test run in any other locale would pass either way.
   */
  it('is unaffected by the Turkish dotless-i rule', () => {
    expect('IVAN'.toLocaleLowerCase('tr-TR')).toBe('ıvan')
    expect(foldIdentifier('IVAN')).toBe('ivan')
  })

  it('agrees with itself for every casing of the same identifier', () => {
    const folded = ['ivan', 'Ivan', 'IVAN', 'iVaN'].map(foldIdentifier)
    expect(new Set(folded).size).toBe(1)
  })
})
