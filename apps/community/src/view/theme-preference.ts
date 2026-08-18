export const THEME_COOKIE = 'meith_theme'
export const SCHEME_COOKIE = 'meith_scheme'

export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const THEME_QUERY = 'theme'

const THEME_KEY = /^[a-z0-9][a-z0-9-]{0,31}$/

export function themeFromQuery(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const key = value.trim().toLowerCase()
  return THEME_KEY.test(key) ? key : null
}

export const COLOUR_SCHEMES = ['system', 'light', 'dark'] as const
export type ColourSchemePreference = (typeof COLOUR_SCHEMES)[number]

export function isColourScheme(value: unknown): value is ColourSchemePreference {
  return COLOUR_SCHEMES.includes(value as ColourSchemePreference)
}

export function schemeClass(scheme: ColourSchemePreference): string {
  return scheme === 'system' ? '' : scheme
}

export function colorSchemeProperty(scheme: ColourSchemePreference): string {
  return scheme === 'system' ? 'light dark' : scheme
}
