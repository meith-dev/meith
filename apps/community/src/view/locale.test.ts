import { describe, expect, it } from 'vitest'

import { AUTOMATIC_LOCALE } from '@meith/accounts'

import { resolveLocale } from './locale'

const SUPPORTED = ['en', 'de', 'pt-BR']

describe('resolveLocale', () => {
  it('prefers what the member chose over what their browser asks for', () => {
    const resolved = resolveLocale({
      stored: 'de',
      accepted: 'pt-BR,pt;q=0.9',
      boardDefault: 'en',
      supported: SUPPORTED,
    })

    expect(resolved).toEqual({ locale: 'de', isAutomatic: false })
  })

  it('reads the automatic preference as no preference at all', () => {
    const resolved = resolveLocale({
      stored: AUTOMATIC_LOCALE,
      accepted: 'de-AT,de;q=0.9',
      boardDefault: 'en',
      supported: SUPPORTED,
    })

    expect(resolved).toEqual({ locale: 'de', isAutomatic: true })
  })

  it('falls back to the board default when the browser asks for nothing this board has', () => {
    const resolved = resolveLocale({
      stored: null,
      accepted: 'ja,ko;q=0.8',
      boardDefault: 'de',
      supported: SUPPORTED,
    })

    expect(resolved).toEqual({ locale: 'de', isAutomatic: true })
  })

  it('falls back to the board default for a stored language no catalog serves', () => {
    const resolved = resolveLocale({
      stored: 'ja',
      accepted: null,
      boardDefault: 'de',
      supported: SUPPORTED,
    })

    expect(resolved).toEqual({ locale: 'de', isAutomatic: false })
  })

  it('ignores a stored value that is not a language tag rather than rendering it into lang', () => {
    const resolved = resolveLocale({
      stored: '"><script>',
      accepted: 'de',
      boardDefault: 'en',
      supported: SUPPORTED,
    })

    expect(resolved).toEqual({ locale: 'de', isAutomatic: true })
  })

  it('serves English when the board default is unreadable, which is how install renders', () => {
    const resolved = resolveLocale({
      stored: null,
      accepted: null,
      boardDefault: null,
      supported: SUPPORTED,
    })

    expect(resolved).toEqual({ locale: 'en', isAutomatic: true })
  })
})
