/** F26 — validate database token overrides and render the final CSS cascade. */

export interface ThemeTokens {
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

export interface ThemeRuntimeStyle {
  readonly css: string
  readonly browserThemeColor: { readonly light: string; readonly dark: string }
}

type TokenOverrides = Readonly<Record<string, string>>

const MAX_CUSTOM_CSS_LENGTH = 100_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** CSS values only: never let a token smuggle a second declaration or markup. */
function assertSafeTokenValue(name: string, value: string): void {
  if (
    value.length === 0 ||
    value.length > 256 ||
    /[;{}<>]/.test(value) ||
    !/^[a-zA-Z0-9#%(),.\s'"/+*=-]+$/.test(value)
  ) {
    throw new Error(`Theme token "${name}" has an unsafe CSS value.`)
  }
}

/**
 * Validates raw JSON at the database boundary. F68 reuses this before saving,
 * while validating here keeps a hand-edited or old database row from injecting
 * a style block into a request.
 */
export function validateTokenOverrides(tokens: ThemeTokens, raw: unknown): TokenOverrides {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) throw new Error('Theme token overrides must be an object.')

  const overrides: Record<string, string> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (!(name in tokens.light) || !(name in tokens.dark)) {
      throw new Error(`Theme token "${name}" is not declared by this theme.`)
    }
    if (typeof value !== 'string') {
      throw new Error(`Theme token "${name}" must have a string value.`)
    }
    assertSafeTokenValue(name, value)
    if (name === 'background' && colorToHex(value) === null) {
      throw new Error('Theme token "background" must be an sRGB hex or OKLCH colour.')
    }
    overrides[name] = value
  }
  return overrides
}

/** Reject stylesheet escapes and network fetches; regular CSS remains CSS. */
export function validateCustomCss(value: string | null): string | null {
  if (value === null || value.trim() === '') return null
  if (
    value.length > MAX_CUSTOM_CSS_LENGTH ||
    /<\/style|@import|url\s*\(|expression\s*\(/i.test(value)
  ) {
    throw new Error('Theme custom CSS contains an unsafe construct.')
  }
  return value
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function hexByte(value: number): string {
  return Math.round(clamp(value) * 255)
    .toString(16)
    .padStart(2, '0')
}

/** Converts the CSS colours accepted for `background` into browser-safe hex. */
export function colorToHex(value: string): string | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const digits = hex[1]!
    return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`.toLowerCase()
  }

  const match = /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/i.exec(
    value.trim(),
  )
  if (!match) return null

  const lightness = Number(match[1])
  const chroma = Number(match[2])
  const hue = (Number(match[3]) * Math.PI) / 180
  if (![lightness, chroma, hue].every(Number.isFinite)) return null

  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s = lightness - 0.0894841775 * a - 1.291485548 * b
  const l3 = l * l * l
  const m3 = m * m * m
  const s3 = s * s * s
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
  const srgb = linear.map((channel) =>
    channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055,
  )
  return `#${srgb.map(hexByte).join('')}`
}

function declarations(overrides: TokenOverrides): string {
  return Object.entries(overrides)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')
}

/**
 * The active theme's own values, as the difference from what is already
 * compiled into `globals.css` (F78).
 *
 * The stylesheet carries **one** theme's tokens — the default's, held to them by
 * `tokens.test.ts` — because they are compiled at build time and a board picks
 * its theme at deploy time. So until this existed, installing a second theme
 * gave you its markup painted in the first theme's palette: every colour wrong,
 * nothing broken, no error anywhere. That is the gap F78 found, and it is in the
 * app rather than in `theme-kit`, which is why the second theme needed no core
 * change.
 *
 * Emitted as a **diff**, not as the whole palette. Two reasons, and the second
 * is the one that matters: a board on the default theme emits nothing at all, so
 * this costs the common case zero bytes on every page; and a token whose value
 * this theme did not change is left to the stylesheet, where a future edit to
 * the compiled default still reaches it.
 *
 * Light and dark are separate because they are separate blocks in the cascade —
 * a theme may differ from the baseline in one scheme and not the other.
 */
function themeDefaults(
  tokens: ThemeTokens,
  baseline: ThemeTokens,
): { light: TokenOverrides; dark: TokenOverrides } {
  const differing = (
    values: Readonly<Record<string, string>>,
    against: Readonly<Record<string, string>>,
  ): TokenOverrides => {
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(values)) {
      if (against[name] !== value) {
        assertSafeTokenValue(name, value)
        out[name] = value
      }
    }
    return out
  }

  return { light: differing(tokens.light, baseline.light), dark: differing(tokens.dark, baseline.dark) }
}

/**
 * @param baseline - the token values the compiled stylesheet already carries.
 * Anything equal to it is not re-declared. Defaults to `tokens` itself, which
 * means "the stylesheet is this theme's" and emits no defaults — the right
 * answer for a caller previewing overrides rather than rendering a page.
 */
export function renderThemeStyle(
  tokens: ThemeTokens,
  rawOverrides: unknown,
  customCss: string | null,
  baseline: ThemeTokens = tokens,
): ThemeRuntimeStyle {
  const overrides = validateTokenOverrides(tokens, rawOverrides)
  const defaults = themeDefaults(tokens, baseline)
  const css = declarations(overrides)
  const lightBackground = overrides.background ?? tokens.light.background
  const darkBackground = overrides.background ?? tokens.dark.background
  const light = colorToHex(lightBackground!)
  const dark = colorToHex(darkBackground!)
  if (light === null || dark === null) {
    throw new Error('Theme background tokens must be sRGB hex or OKLCH colours.')
  }

  /*
   * Order is the cascade, and it is the whole correctness argument: the theme's
   * own values first, then the board's overrides on top of them, then custom
   * CSS. Emitting the overrides first would let a theme default win over the
   * operator's explicit choice, which is F26's rule inverted.
   *
   * The media selector matches the fallback block in globals.css, so both
   * layers win even when the board follows the operating system scheme.
   */
  const scoped = (declared: string): string =>
    declared === ''
      ? ''
      : `:root{${declared}}.dark{${declared}}@media (prefers-color-scheme: dark){:root:not(.light){${declared}}}`

  const lightDefaults = declarations(defaults.light)
  const darkDefaults = declarations(defaults.dark)

  return {
    css:
      (lightDefaults === '' ? '' : `:root{${lightDefaults}}`) +
      (darkDefaults === ''
        ? ''
        : `.dark{${darkDefaults}}@media (prefers-color-scheme: dark){:root:not(.light){${darkDefaults}}}`) +
      scoped(css) +
      (validateCustomCss(customCss) ?? ''),
    browserThemeColor: { light, dark },
  }
}
