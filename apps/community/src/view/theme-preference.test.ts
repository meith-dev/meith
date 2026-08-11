import { describe, expect, it } from 'vitest'

import { THEME_QUERY, themeFromQuery } from './theme-preference'

describe('themeFromQuery', () => {
  it('names the parameter a demo link carries', () => {
    expect(THEME_QUERY).toBe('theme')
  })

  it.each(['phasebook', 'midnight', 'default', 'a', 'my-theme-2'])('accepts %s', (key) => {
    expect(themeFromQuery(key)).toBe(key)
  })

  it('trims and lowercases, so a hand-typed link still works', () => {
    expect(themeFromQuery(' Phasebook ')).toBe('phasebook')
  })

  it.each([
    ['', 'empty'],
    ['-leading', 'a leading dash'],
    ['has space', 'a space'],
    ['../etc/passwd', 'a path'],
    ['a'.repeat(33), 'over the length cap'],
    ['théme', 'a non-ascii letter'],
  ])('rejects %j — %s', (value) => {
    expect(themeFromQuery(value)).toBeNull()
  })

  it.each([null, undefined, 42, {}])('rejects the non-string %j', (value) => {
    expect(themeFromQuery(value as string | null | undefined)).toBeNull()
  })

  it('does not decide whether the theme exists', () => {
    expect(themeFromQuery('no-such-theme')).toBe('no-such-theme')
  })
})
