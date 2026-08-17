import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  LIGHT_TOKENS,
  SCHEME_INDEPENDENT_TOKENS,
  TOKEN_NAMES,
} from '@meith/theme-default'

import { colorToHex } from '../server/theme-style'
import { isSchemeIndependent } from '../view/theme-tokens'

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'globals.css'), 'utf8')

function declaredTokens(selector: string): Map<string, string> {
  const block = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{(.*?)^\\}`, 'ms').exec(CSS)
  expect(block, `globals.css has no top-level "${selector} { … }" block`).not.toBeNull()

  const tokens = new Map<string, string>()
  for (const match of block![1]!.matchAll(/^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    tokens.set(match[1]!, match[2]!.trim())
  }
  return tokens
}

function fallbackTokens(): Map<string, string> {
  const media = /^@media \(prefers-color-scheme: dark\) \{(.*?)^\}/ms.exec(CSS)
  expect(media, 'globals.css has no top-level prefers-color-scheme block').not.toBeNull()

  const tokens = new Map<string, string>()
  for (const match of media![1]!.matchAll(/^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    tokens.set(match[1]!, match[2]!.trim())
  }
  return tokens
}

const cssLight = declaredTokens(':root')
const cssDark = declaredTokens('.dark')
const cssFallback = fallbackTokens()

describe('token registry', () => {
  it('names exactly the custom properties :root declares', () => {
    expect([...TOKEN_NAMES].sort()).toEqual([...cssLight.keys()].sort())
  })

  it('has no duplicate names', () => {
    expect(new Set(TOKEN_NAMES).size).toBe(TOKEN_NAMES.length)
  })
})

describe('light values', () => {
  it('match :root exactly', () => {
    for (const name of TOKEN_NAMES) {
      expect(LIGHT_TOKENS[name], `--${name} in :root`).toBe(cssLight.get(name))
    }
  })
})

describe('dark values', () => {
  it('match .dark exactly', () => {
    for (const name of TOKEN_NAMES) {
      if ((SCHEME_INDEPENDENT_TOKENS as readonly string[]).includes(name)) continue
      expect(DARK_TOKENS[name], `--${name} in .dark`).toBe(cssDark.get(name))
    }
  })

  it('omits only the scheme-independent tokens', () => {
    const omitted = TOKEN_NAMES.filter((name) => !cssDark.has(name))
    expect([...omitted].sort()).toEqual([...SCHEME_INDEPENDENT_TOKENS].sort())
  })

  it('carries the light value for the scheme-independent tokens', () => {
    for (const name of SCHEME_INDEPENDENT_TOKENS) {
      expect(DARK_TOKENS[name]).toBe(LIGHT_TOKENS[name])
    }
  })
})

describe('the prefers-color-scheme fallback', () => {
  it('declares exactly what .dark declares, with the same values', () => {
    expect(Object.fromEntries(cssFallback)).toEqual(Object.fromEntries(cssDark))
  })
})

describe('scheme-independence', () => {
  it('agrees with the kind the theme editor infers', () => {
    for (const name of TOKEN_NAMES) {
      const independentInTheme = (SCHEME_INDEPENDENT_TOKENS as readonly string[]).includes(name)
      expect(isSchemeIndependent(name), `--${name}`).toBe(independentInTheme)
    }
  })
})

describe('browser theme colour', () => {
  it('matches its background tokens in Safari-safe sRGB hex', () => {
    expect(BROWSER_THEME_COLOR).toEqual({
      light: colorToHex(LIGHT_TOKENS.background),
      dark: colorToHex(DARK_TOKENS.background),
    })
  })
})
