export type LogoScheme = 'light' | 'dark'

export const LOGO_SCHEMES: readonly LogoScheme[] = ['light', 'dark']

const LOGO_KEY = /^board\/logo-(light|dark)-[a-f0-9-]{36}\.(png|jpg|webp|svg)$/

export function isLogoScheme(value: unknown): value is LogoScheme {
  return value === 'light' || value === 'dark'
}

export function isLogoKey(value: string): boolean {
  return LOGO_KEY.test(value)
}

export function logoFormat(key: string): string | null {
  return LOGO_KEY.exec(key)?.[2] ?? null
}

export function logoPath(scheme: LogoScheme, key: string): string {
  return `/logo/${scheme}?v=${key.slice(-16, -4)}`
}
