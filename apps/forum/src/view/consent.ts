export const CONSENT_COOKIE = 'meith_consent'

export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 182

export const CONSENT_CHOICES = ['granted', 'denied'] as const
export type ConsentChoice = (typeof CONSENT_CHOICES)[number]

export function isConsentChoice(value: unknown): value is ConsentChoice {
  return CONSENT_CHOICES.includes(value as ConsentChoice)
}

export const ESSENTIAL_PROCESSING: readonly { key: string; label: string }[] = [
  { key: 'session', label: 'Keeping you signed in, and keeping that session secure' },
  { key: 'preferences', label: 'Remembering the settings you choose here, in this browser' },
]

export const OPTIONAL_PROCESSING: readonly { key: string; label: string }[] = [
  { key: 'analytics', label: 'Anonymous usage statistics, so the board can see what is read' },
]

export const CONSENT_REGIONS: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB', 'CH',
])

export type ConsentMode = 'auto' | 'always' | 'off'

export function consentRequired(mode: ConsentMode, country: string | null): boolean {
  if (mode === 'off') return false
  if (mode === 'always') return true
  return country === null || CONSENT_REGIONS.has(country.toUpperCase())
}

export const COUNTRY_HEADERS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'x-country-code',
  'x-geo-country',
] as const

export function countryFrom(headers: {
  get(name: string): string | null | undefined
}): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = headers.get(name)
    if (typeof value !== 'string') continue

    const code = value.trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') return code
  }
  return null
}
