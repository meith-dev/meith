import { describe, expect, it } from 'vitest'

import { foldIdentifier, foldSecurityIdentifier } from './case-fold'

describe('foldIdentifier', () => {
  it('folds case and trims surrounding whitespace', () => {
    expect(foldIdentifier('  Ivan  ')).toBe('ivan')
    expect(foldIdentifier('USER@Example.COM')).toBe('user@example.com')
  })

  it('is unaffected by the Turkish dotless-i rule', () => {
    expect('IVAN'.toLocaleLowerCase('tr-TR')).toBe('ıvan')
    expect(foldIdentifier('IVAN')).toBe('ivan')
  })

  it('agrees with itself for every casing of the same identifier', () => {
    const folded = ['ivan', 'Ivan', 'IVAN', 'iVaN'].map(foldIdentifier)
    expect(new Set(folded).size).toBe(1)
  })
})

it('normalizes compatibility characters for policy checks without changing persisted lookup keys', () => {
  expect(foldSecurityIdentifier(' ＡＤＭＩＮ ')).toBe('admin')
  expect(foldSecurityIdentifier('𝐚𝐝𝐦𝐢𝐧')).toBe('admin')
  expect(foldSecurityIdentifier('e\u0301')).toBe(foldSecurityIdentifier('é'))
  expect(foldIdentifier('ＡＤＭＩＮ')).toBe('ａｄｍｉｎ')
})
