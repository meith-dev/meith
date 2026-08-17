import { describe, expect, it } from 'vitest'

import {
  localeChain,
  localeDirection,
  negotiateLocale,
  normaliseLocale,
  parseAcceptLanguage,
} from './locale'

describe('normaliseLocale', () => {
  it('spells a tag the one way everything else compares against', () => {
    expect(normaliseLocale('PT-br')).toBe('pt-BR')
    expect(normaliseLocale('pt_BR')).toBe('pt-BR')
    expect(normaliseLocale('  de  ')).toBe('de')
    expect(normaliseLocale('zh-hans-cn')).toBe('zh-Hans-CN')
  })

  it('refuses anything that is not a language tag', () => {
    expect(normaliseLocale('*')).toBeNull()
    expect(normaliseLocale('')).toBeNull()
    expect(normaliseLocale('../../etc/passwd')).toBeNull()
    expect(normaliseLocale('english')).toBeNull()
    expect(normaliseLocale(null)).toBeNull()
  })
})

describe('localeChain', () => {
  it('walks from the most specific tag to the bare language', () => {
    expect(localeChain('zh-Hans-CN')).toEqual(['zh-Hans-CN', 'zh-Hans', 'zh'])
    expect(localeChain('en')).toEqual(['en'])
  })
})

describe('parseAcceptLanguage', () => {
  it('orders by quality, keeping the header order for ties', () => {
    const accepted = parseAcceptLanguage('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5')

    expect(accepted.map((entry) => entry.locale)).toEqual(['fr-CH', 'fr', 'en', 'de'])
  })

  it('drops anything refused outright', () => {
    expect(parseAcceptLanguage('de;q=0, en').map((entry) => entry.locale)).toEqual(['en'])
  })

  it('reads an absent or malformed header as no preference', () => {
    expect(parseAcceptLanguage(null)).toEqual([])
    expect(parseAcceptLanguage(';;;')).toEqual([])
  })
})

describe('negotiateLocale', () => {
  const supported = ['en', 'de', 'pt-BR']

  it('takes the first request the board can serve', () => {
    expect(negotiateLocale({ requested: ['fr', 'de'], supported, fallback: 'en' })).toBe('de')
  })

  it('falls back along the tag before moving to the next request', () => {
    expect(negotiateLocale({ requested: ['de-AT', 'en'], supported, fallback: 'en' })).toBe('de')
  })

  it('accepts a region the board has when the request named another', () => {
    expect(negotiateLocale({ requested: ['pt-PT'], supported, fallback: 'en' })).toBe('pt-BR')
  })

  it('falls back to the board default when nothing matches', () => {
    expect(negotiateLocale({ requested: ['ja', null], supported, fallback: 'en' })).toBe('en')
  })

  it('ignores a request that is not a language tag at all', () => {
    expect(negotiateLocale({ requested: ['<script>'], supported, fallback: 'en' })).toBe('en')
  })
})

describe('localeDirection', () => {
  it('knows which scripts run right to left', () => {
    expect(localeDirection('ar-EG')).toBe('rtl')
    expect(localeDirection('he')).toBe('rtl')
    expect(localeDirection('en')).toBe('ltr')
    expect(localeDirection('pt-BR')).toBe('ltr')
  })
})
