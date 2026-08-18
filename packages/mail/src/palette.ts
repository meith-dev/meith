import { colourToHex } from '@meith/theme-kit'

export type TokenRecord = Readonly<Record<string, string>>

export interface ThemeTokenSet {
  readonly light: TokenRecord
  readonly dark: TokenRecord
}

export interface MailScheme {
  readonly page: string
  readonly card: string
  readonly band: string
  readonly border: string
  readonly text: string
  readonly muted: string
  readonly primary: string
  readonly primaryText: string
}

export interface MailPalette {
  readonly light: MailScheme
  readonly dark: MailScheme
  readonly bodyFont: string
  readonly headingFont: string
  readonly radius: number
}

const FALLBACK: { readonly light: MailScheme; readonly dark: MailScheme } = {
  light: {
    page: '#f4f4f4',
    card: '#ffffff',
    band: '#ebebeb',
    border: '#dfdfdf',
    text: '#171717',
    muted: '#616161',
    primary: '#047857',
    primaryText: '#fafafa',
  },
  dark: {
    page: '#0b0b0b',
    card: '#151515',
    band: '#0f0f0f',
    border: '#303030',
    text: '#f4f4f4',
    muted: '#9f9f9f',
    primary: '#35d399',
    primaryText: '#04160f',
  },
}

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"

const MAX_RADIUS = 20

const ROOT_FONT_PX = 16

const VAR_REFERENCE = /^var\(\s*--([\w-]+)\s*\)$/

function dereference(tokens: TokenRecord, name: string, depth = 0): string {
  const value = tokens[name]
  if (value === undefined || depth > 4) return ''

  const reference = VAR_REFERENCE.exec(value.trim())
  return reference === null ? value.trim() : dereference(tokens, reference[1]!, depth + 1)
}

function colour(tokens: TokenRecord, names: readonly string[], fallback: string): string {
  for (const name of names) {
    const hex = colourToHex(dereference(tokens, name))
    if (hex !== null) return hex
  }
  return fallback
}

function fontStack(tokens: TokenRecord, name: string): string {
  const declared = dereference(tokens, name)
    .split(',')
    .map((segment) => segment.trim())
    .map((segment) => segment.replace(/\x22/g, '\x27'))
    .filter((segment) => segment !== '' && !segment.includes('var(') && !/[;{}<>]/.test(segment))

  const fallbacks = SANS_FALLBACK.split(',').map((segment) => segment.trim())
  const seen = new Set<string>()

  return [...declared, ...fallbacks]
    .filter((segment) => {
      const key = segment.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(', ')
}

function radiusPx(tokens: TokenRecord): number {
  const declared = dereference(tokens, 'radius')
  const match = /^([\d.]+)(rem|px)$/.exec(declared)
  if (match === null) return 8

  const value = Number(match[1]) * (match[2] === 'rem' ? ROOT_FONT_PX : 1)
  return Number.isFinite(value) ? Math.round(Math.min(MAX_RADIUS, Math.max(0, value))) : 8
}

function scheme(tokens: TokenRecord, fallback: MailScheme): MailScheme {
  return {
    page: colour(tokens, ['background'], fallback.page),
    card: colour(tokens, ['card', 'background'], fallback.card),
    band: colour(tokens, ['surface', 'muted', 'card'], fallback.band),
    border: colour(tokens, ['border'], fallback.border),
    text: colour(tokens, ['card-foreground', 'foreground'], fallback.text),
    muted: colour(tokens, ['muted-foreground', 'foreground'], fallback.muted),
    primary: colour(tokens, ['primary'], fallback.primary),
    primaryText: colour(tokens, ['primary-foreground'], fallback.primaryText),
  }
}

export function mergeTokenOverrides(baseline: ThemeTokenSet, overrides: unknown): ThemeTokenSet {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return baseline
  }

  const record = overrides as Record<string, unknown>
  const shaped =
    Object.keys(record).length > 0 &&
    Object.keys(record).every((key) => key === 'light' || key === 'dark')

  const flat = shaped ? {} : strings(record)

  return {
    light: { ...baseline.light, ...flat, ...(shaped ? strings(record.light) : {}) },
    dark: { ...baseline.dark, ...flat, ...(shaped ? strings(record.dark) : {}) },
  }
}

function strings(value: unknown): TokenRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '',
    ),
  )
}

export function mailPalette(tokens: ThemeTokenSet | null): MailPalette {
  if (tokens === null) {
    return {
      light: FALLBACK.light,
      dark: FALLBACK.dark,
      bodyFont: SANS_FALLBACK,
      headingFont: SANS_FALLBACK,
      radius: 8,
    }
  }

  return {
    light: scheme(tokens.light, FALLBACK.light),
    dark: scheme(tokens.dark, FALLBACK.dark),
    bodyFont: fontStack(tokens.light, 'font-sans-stack'),
    headingFont: fontStack(tokens.light, 'font-heading-stack'),
    radius: radiusPx(tokens.light),
  }
}

export const FALLBACK_PALETTE: MailPalette = mailPalette(null)
