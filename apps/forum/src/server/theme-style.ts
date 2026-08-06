import { colourToHex } from '@/view/oklch'

export interface ThemeTokens {
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

export interface ThemeRuntimeStyle {
  readonly css: string
  readonly browserThemeColor: { readonly light: string; readonly dark: string }
}

export interface TokenOverrides {
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

export interface BoardTheme {
  readonly key: string
  readonly tokens: ThemeTokens
  readonly overrides: unknown
  readonly customCss: string | null
}

export type ColourScheme = 'light' | 'dark'

export const COLOUR_SCHEMES: readonly ColourScheme[] = ['light', 'dark']

const MAX_CUSTOM_CSS_LENGTH = 100_000

const THEME_KEY = /^[a-z0-9][a-z0-9_-]*$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertSafeCssValue(name: string, value: string): void {
  if (
    value.length === 0 ||
    value.length > 256 ||
    /[;{}<>]/.test(value) ||
    !/^[a-zA-Z0-9#%(),.\s'"/+*=-]+$/.test(value)
  ) {
    throw new Error(`Theme ${name} has an unsafe CSS value.`)
  }
}

function assertSafeThemeKey(key: string): void {
  if (!THEME_KEY.test(key)) {
    throw new Error(`Theme key "${key}" cannot be used in a stylesheet selector.`)
  }
}

function isSchemeShaped(raw: Record<string, unknown>): boolean {
  const keys = Object.keys(raw)
  return (
    keys.every((key) => key === 'light' || key === 'dark') &&
    keys.every((key) => isRecord(raw[key]))
  )
}

function validateScheme(
  tokens: ThemeTokens,
  raw: Record<string, unknown>,
): Record<string, string> {
  const overrides: Record<string, string> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (!(name in tokens.light) || !(name in tokens.dark)) {
      throw new Error(`Theme token "${name}" is not declared by this theme.`)
    }
    if (typeof value !== 'string') {
      throw new Error(`Theme token "${name}" must have a string value.`)
    }
    assertSafeCssValue(`token "${name}"`, value)
    if (name === 'background' && colorToHex(value) === null) {
      throw new Error('Theme token "background" must be an sRGB hex or OKLCH colour.')
    }
    overrides[name] = value
  }
  return overrides
}

export function validateTokenOverrides(tokens: ThemeTokens, raw: unknown): TokenOverrides {
  if (raw === undefined || raw === null) return { light: {}, dark: {} }
  if (!isRecord(raw)) throw new Error('Theme token overrides must be an object.')

  if (isSchemeShaped(raw)) {
    return {
      light: validateScheme(tokens, isRecord(raw.light) ? raw.light : {}),
      dark: validateScheme(tokens, isRecord(raw.dark) ? raw.dark : {}),
    }
  }

  const both = validateScheme(tokens, raw)
  return { light: both, dark: { ...both } }
}

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

export const colorToHex = colourToHex

function declarations(values: Readonly<Record<string, string>>): string {
  return Object.entries(values)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')
}

function effectiveTokens(theme: BoardTheme): ThemeTokens {
  const overrides = validateTokenOverrides(theme.tokens, theme.overrides)
  return {
    light: { ...theme.tokens.light, ...overrides.light },
    dark: { ...theme.tokens.dark, ...overrides.dark },
  }
}

function differing(
  values: Readonly<Record<string, string>>,
  against: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    if (against[name] !== value) {
      assertSafeCssValue(`token "${name}"`, value)
      out[name] = value
    }
  }
  return out
}

function schemeBlocks(
  light: Record<string, string>,
  dark: Record<string, string>,
  selector: { light: string; dark: string; media: string },
): string {
  const lightCss = declarations(light)
  const darkCss = declarations(dark)

  return (
    (lightCss === '' ? '' : `${selector.light}{${lightCss}}`) +
    (darkCss === ''
      ? ''
      : `${selector.dark}{${darkCss}}` +
        `@media (prefers-color-scheme: dark){${selector.media}{${darkCss}}}`)
  )
}

export function renderBoardStyle(input: {
  readonly themes: readonly BoardTheme[]
  readonly defaultKey: string
  readonly baseline: ThemeTokens
}): ThemeRuntimeStyle {
  const active = input.themes.find((theme) => theme.key === input.defaultKey)
  if (active === undefined) {
    throw new Error(`Theme "${input.defaultKey}" is not among the enabled themes.`)
  }

  const activeTokens = effectiveTokens(active)

  let css = schemeBlocks(
    differing(activeTokens.light, input.baseline.light),
    differing(activeTokens.dark, input.baseline.dark),
    { light: ':root', dark: '.dark', media: ':root:not(.light)' },
  )
  css += validateCustomCss(active.customCss) ?? ''

  for (const theme of input.themes) {
    if (theme.key === active.key) continue
    assertSafeThemeKey(theme.key)

    const tokens = effectiveTokens(theme)
    const scope = `[data-theme="${theme.key}"]`

    css += schemeBlocks(
      differing(tokens.light, activeTokens.light),
      differing(tokens.dark, activeTokens.dark),
      {
        light: `:root${scope}`,
        dark: `.dark${scope}`,
        media: `:root${scope}:not(.light)`,
      },
    )

    const custom = validateCustomCss(theme.customCss)
    if (custom !== null) css += `:root${scope}{${custom}}`
  }

  const light = colorToHex(activeTokens.light.background ?? '')
  const dark = colorToHex(activeTokens.dark.background ?? '')
  if (light === null || dark === null) {
    throw new Error('Theme background tokens must be sRGB hex or OKLCH colours.')
  }

  return { css, browserThemeColor: { light, dark } }
}

export function renderThemeStyle(
  tokens: ThemeTokens,
  rawOverrides: unknown,
  customCss: string | null,
  baseline: ThemeTokens = tokens,
): ThemeRuntimeStyle {
  return renderBoardStyle({
    themes: [{ key: 'default', tokens, overrides: rawOverrides, customCss }],
    defaultKey: 'default',
    baseline,
  })
}

export interface GroupNameColour {
  readonly groupId: number
  readonly light: string | null
  readonly dark: string | null
}

export function groupNameClass(groupId: number): string {
  return `gname-${groupId}`
}

export function renderGroupNameStyle(groups: readonly GroupNameColour[]): string {
  if (groups.length === 0) return ''

  const block = (pick: (group: GroupNameColour) => string | null, prefix: string): string =>
    groups
      .map((group) => {
        const colour = pick(group)
        if (colour === null) return ''
        assertSafeCssValue(`group ${group.groupId} colour`, colour)
        const selector = `.${groupNameClass(group.groupId)}`
        return `${prefix}${selector}${selector}{color:${colour};}`
      })
      .join('')

  const dark = block((group) => group.dark, '.dark ')

  return (
    block((group) => group.light, '') +
    dark +
    (dark === ''
      ? ''
      : `@media (prefers-color-scheme: dark){${block((group) => group.dark, ':root:not(.light) ')}}`)
  )
}
