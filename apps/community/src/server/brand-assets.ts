import 'server-only'

import { drivers } from '@meith/drivers'
import { DARK_TOKENS, LIGHT_TOKENS } from '@meith/theme-default'
import { colourToHex } from '@meith/theme-kit'

import { BOARD_TITLE } from '@/view/shell'

import { logoKey } from './branding'
import { contentTypeFor } from './image-upload'
import { getSettings } from './settings'
import { getBoardThemeStyle } from './theme-runtime'
import type { ThemeTokens } from './theme-style'

export type BrandScheme = 'light' | 'dark'

export interface BrandPalette {
  readonly background: string
  readonly foreground: string
  readonly primary: string
  readonly primaryForeground: string
  readonly muted: string
  readonly border: string
}

export interface BrandInfo {
  readonly title: string
  readonly description: string
  readonly initials: string
  readonly light: BrandPalette
  readonly dark: BrandPalette
}

const EMBEDDABLE_LOGO_TYPES = new Set(['image/png', 'image/jpeg'])

const MAX_EMBEDDED_LOGO_BYTES = 192 * 1024

const DESCRIPTION_LIMIT = 160

const MARK_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

function hex(value: string | undefined, fallback: string | undefined, ultimate: string): string {
  return (
    (value !== undefined ? colourToHex(value) : null) ??
    (fallback !== undefined ? colourToHex(fallback) : null) ??
    ultimate
  )
}

function paletteFor(
  tokens: Readonly<Record<string, string>>,
  defaults: Readonly<Record<string, string>>,
): BrandPalette {
  return {
    background: hex(tokens.background, defaults.background, '#ffffff'),
    foreground: hex(tokens.foreground, defaults.foreground, '#111111'),
    primary: hex(tokens.primary, defaults.primary, '#111111'),
    primaryForeground: hex(tokens['primary-foreground'], defaults['primary-foreground'], '#ffffff'),
    muted: hex(tokens['muted-foreground'], defaults['muted-foreground'], '#666666'),
    border: hex(tokens.border, defaults.border, '#dddddd'),
  }
}

export function brandInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  if (words.length === 0) return '?'

  const first = Array.from(words[0] ?? '')[0] ?? ''
  const second = words.length > 1 ? (Array.from(words[1] ?? '')[0] ?? '') : ''
  const letters = `${first}${second}`
  return letters === '' ? '?' : letters.toUpperCase()
}

export function trimDescription(description: string): string {
  const clean = description.trim()
  if (clean.length <= DESCRIPTION_LIMIT) return clean
  return `${clean.slice(0, DESCRIPTION_LIMIT - 1).trimEnd()}…`
}

export async function loadBrandInfo(): Promise<BrandInfo> {
  let title = BOARD_TITLE
  let description = ''
  let tokens: ThemeTokens = { light: LIGHT_TOKENS, dark: DARK_TOKENS }

  try {
    const settings = await getSettings()
    title = settings.get('board.name').trim() || BOARD_TITLE
    description = settings.get('board.description').trim()
  } catch {}

  try {
    tokens = (await getBoardThemeStyle()).defaultTokens
  } catch {}

  return {
    title,
    description: trimDescription(description),
    initials: brandInitials(title),
    light: paletteFor(tokens.light, LIGHT_TOKENS),
    dark: paletteFor(tokens.dark, DARK_TOKENS),
  }
}

export async function loadLogoDataUri(scheme: BrandScheme): Promise<string | null> {
  try {
    const key = (await logoKey(scheme)) ?? (await logoKey(scheme === 'light' ? 'dark' : 'light'))
    if (key === null) return null

    const type = contentTypeFor(key)
    if (!EMBEDDABLE_LOGO_TYPES.has(type)) return null

    const bytes = await drivers().files.get(key)
    if (bytes === undefined || bytes.byteLength === 0) return null
    if (bytes.byteLength > MAX_EMBEDDED_LOGO_BYTES) return null

    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildFaviconSvg(info: BrandInfo): string {
  const label = escapeXml(info.initials)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`,
    `<style>`,
    `.brand-bg{fill:${info.light.primary}}.brand-fg{fill:${info.light.primaryForeground}}`,
    `@media(prefers-color-scheme:dark){`,
    `.brand-bg{fill:${info.dark.primary}}.brand-fg{fill:${info.dark.primaryForeground}}}`,
    `</style>`,
    `<rect class="brand-bg" width="64" height="64" rx="14"/>`,
    `<text class="brand-fg" x="32" y="35" text-anchor="middle" dominant-baseline="central" font-family="${MARK_FONT_STACK}" font-size="34" font-weight="700">${label}</text>`,
    `</svg>`,
  ].join('')
}
