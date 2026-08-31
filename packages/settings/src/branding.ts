export type LogoScheme = 'light' | 'dark'

export const LOGO_SCHEMES: readonly LogoScheme[] = ['light', 'dark']

const LOGO_KEY = /^board\/logo-(light|dark)-[a-f0-9-]{36}\.(png|jpg|webp|svg)$/

const FAVICON_KEY = /^board\/favicon-[a-f0-9-]{36}\.(png|jpg|webp|svg)$/

export function isLogoScheme(value: unknown): value is LogoScheme {
  return value === 'light' || value === 'dark'
}

export function isLogoKey(value: string): boolean {
  return LOGO_KEY.test(value)
}

export function isFaviconKey(value: string): boolean {
  return FAVICON_KEY.test(value)
}

export function logoFormat(key: string): string | null {
  return LOGO_KEY.exec(key)?.[2] ?? null
}

export function faviconFormat(key: string): string | null {
  return FAVICON_KEY.exec(key)?.[1] ?? null
}

export function faviconPath(key: string): string {
  return `/brand/favicon?v=${key.slice(-16, -4)}`
}

export function logoPath(scheme: LogoScheme, key: string): string {
  return `/logo/${scheme}?v=${key.slice(-16, -4)}`
}
