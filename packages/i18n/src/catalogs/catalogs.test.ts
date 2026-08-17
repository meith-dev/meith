import { describe, expect, it } from 'vitest'

import { SOURCE_LOCALE } from '../locale'
import { messagePlaceholders, parseMessage } from '../message'
import { BOARD_CATALOG } from './index'

const locales = Object.keys(BOARD_CATALOG.messages)

describe('the board catalogs', () => {
  it('ships the source locale', () => {
    expect(locales).toContain(SOURCE_LOCALE)
  })

  it.each(locales)('parses every message in %s', (locale) => {
    const catalog = BOARD_CATALOG.messages[locale] ?? {}

    for (const [key, pattern] of Object.entries(catalog)) {
      expect(() => parseMessage(pattern), `${locale}: ${key}`).not.toThrow()
    }
  })

  it.each(locales.filter((locale) => locale !== SOURCE_LOCALE))(
    'translates only keys the source locale has, in %s',
    (locale) => {
      const source = new Set(Object.keys(BOARD_CATALOG.messages[SOURCE_LOCALE] ?? {}))
      const orphans = Object.keys(BOARD_CATALOG.messages[locale] ?? {}).filter(
        (key) => !source.has(key),
      )

      expect(orphans, `${locale} carries keys nothing reads`).toEqual([])
    },
  )

  it.each(locales.filter((locale) => locale !== SOURCE_LOCALE))(
    'reads the same arguments as the source locale, in %s',
    (locale) => {
      const source = BOARD_CATALOG.messages[SOURCE_LOCALE] ?? {}

      for (const [key, pattern] of Object.entries(BOARD_CATALOG.messages[locale] ?? {})) {
        const expected = source[key]
        if (expected === undefined) continue

        expect([...messagePlaceholders(pattern)].sort(), `${locale}: ${key}`).toEqual(
          [...messagePlaceholders(expected)].sort(),
        )
      }
    },
  )

  it('names an hour cycle Intl understands, in every locale', () => {
    for (const locale of locales) {
      const cycle = BOARD_CATALOG.messages[locale]?.['time.hourCycle']
      if (cycle === undefined) continue

      expect(['h11', 'h12', 'h23', 'h24', 'auto'], locale).toContain(cycle)
    }
  })
})
