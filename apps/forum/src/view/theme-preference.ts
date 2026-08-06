export const THEME_COOKIE = 'meith_theme'
export const SCHEME_COOKIE = 'meith_scheme'

export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const COLOUR_SCHEMES = ['system', 'light', 'dark'] as const
export type ColourSchemePreference = (typeof COLOUR_SCHEMES)[number]

export const COLOUR_SCHEME_LABEL: Record<ColourSchemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

export function isColourScheme(value: unknown): value is ColourSchemePreference {
  return COLOUR_SCHEMES.includes(value as ColourSchemePreference)
}

export function schemeClass(scheme: ColourSchemePreference): string {
  return scheme === 'system' ? '' : scheme
}

export function colorSchemeProperty(scheme: ColourSchemePreference): string {
  return scheme === 'system' ? 'light dark' : scheme
}
