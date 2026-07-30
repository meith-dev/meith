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

export function renderThemeStyle(tokens: ThemeTokens, rawOverrides: unknown, customCss: string | null): ThemeRuntimeStyle {
  const overrides = validateTokenOverrides(tokens, rawOverrides)
  const css = declarations(overrides)
  const lightBackground = overrides.background ?? tokens.light.background
  const darkBackground = overrides.background ?? tokens.dark.background
  const light = colorToHex(lightBackground!)
  const dark = colorToHex(darkBackground!)
  if (light === null || dark === null) {
    throw new Error('Theme background tokens must be sRGB hex or OKLCH colours.')
  }

  return {
    // The media selector matches the fallback block in globals.css, so an
    // override wins even when the board follows the operating system scheme.
    css:
      css === ''
        ? validateCustomCss(customCss) ?? ''
        : `:root{${css}}.dark{${css}}@media (prefers-color-scheme: dark){:root:not(.light){${css}}}${validateCustomCss(customCss) ?? ''}`,
    browserThemeColor: { light, dark },
  }
}
