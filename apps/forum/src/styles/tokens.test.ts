/**
 * F25 — `globals.css` and the theme's typed tokens must agree.
 *
 * Two copies of the palette exist for good reasons: the CSS is what paints on
 * first byte with no JS and no database, and the TypeScript mirror is what F26
 * validates database overrides against and what `<meta name="theme-color">`
 * reads. Two copies with nothing comparing them drift — and had: the mirror named
 * four tokens the CSS does not define, omitted fifteen it does, and every value
 * was from an older palette. See the header of `themes/default/src/tokens.ts`.
 *
 * This test lives in the app because the app owns `globals.css`; the dependency
 * runs app → theme, never the reverse.
 *
 * It is deliberately an exact-string comparison. A tolerant comparison ("both
 * are oklch, close enough") would let the two diverge slowly, which is the same
 * failure taking longer.
 */

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
} from '@forum/theme-default'

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'globals.css'),
  'utf8',
)

/**
 * Custom properties declared in a top-level block.
 *
 * Anchored to column 0 so the `@media (prefers-color-scheme: dark)` fallback
 * block — which repeats the dark values for browsers without the `.dark` class —
 * is not mistaken for the `:root` declarations.
 */
function declaredTokens(selector: string): Map<string, string> {
  const block = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{(.*?)^\\}`, 'ms').exec(CSS)
  expect(block, `globals.css has no top-level "${selector} { … }" block`).not.toBeNull()

  const tokens = new Map<string, string>()
  for (const match of block![1]!.matchAll(/^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    tokens.set(match[1]!, match[2]!.trim())
  }
  return tokens
}

const cssLight = declaredTokens(':root')
const cssDark = declaredTokens('.dark')

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

  /*
   * The `.dark` block legitimately omits geometry and the font stack. That is
   * only legitimate for the tokens that say so: any *other* omission is a token
   * that silently keeps its light value in dark mode, which is a visual bug
   * (a light `--border` on a dark background) rather than a deliberate choice.
   */
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

describe('browser theme colour', () => {
  /*
   * Format only, and the reason is recorded rather than hidden: asserting these
   * *match* `background` needs an OKLCH → sRGB conversion in code, which arrives
   * with F26's override pipeline because an overridden background has to be
   * converted too. Until then this catches the mistake that actually breaks it —
   * putting an `oklch()` string here, which Safari ignores, leaving the browser
   * chrome unstyled with no error anywhere.
   */
  it('is plain sRGB hex, which is all Safari accepts', () => {
    expect(BROWSER_THEME_COLOR.light).toMatch(/^#[0-9a-f]{6}$/)
    expect(BROWSER_THEME_COLOR.dark).toMatch(/^#[0-9a-f]{6}$/)
  })
})
