import { isLogoKey, type LogoScheme, logoFormat, logoPath } from '@meith/settings'

import { FALLBACK_PALETTE, type MailPalette, mailPalette, type ThemeTokenSet } from './palette'

export interface MailLogo {
  readonly src: string
  readonly darkSrc: string | null
  readonly alt: string
}

export interface MailBrand {
  readonly boardName: string
  readonly fromName?: string
  readonly boardUrl: string
  readonly logo: MailLogo | null
  readonly palette: MailPalette
}

const UNRENDERABLE_IN_MAIL: readonly string[] = ['svg']

export function normaliseBoardUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s/]+$/i.test(trimmed) ? trimmed : ''
}

export function absoluteUrl(boardUrl: string, path: string | null): string | null {
  if (boardUrl === '' || path === null || !path.startsWith('/')) return null
  return `${boardUrl}${path}`
}

function renderable(key: string): boolean {
  const format = logoFormat(key)
  return format !== null && !UNRENDERABLE_IN_MAIL.includes(format)
}

function usableKey(value: string): string | null {
  return isLogoKey(value) && renderable(value) ? value : null
}

export function mailLogo(input: {
  readonly boardUrl: string
  readonly lightKey: string
  readonly darkKey: string
  readonly alt: string
}): MailLogo | null {
  const boardUrl = normaliseBoardUrl(input.boardUrl)
  if (boardUrl === '' || input.alt.trim() === '') return null

  const light = usableKey(input.lightKey)
  const dark = usableKey(input.darkKey)
  if (light === null && dark === null) return null

  const source = (scheme: LogoScheme, key: string): string => `${boardUrl}${logoPath(scheme, key)}`

  const lightSrc = light === null ? source('dark', dark!) : source('light', light)
  const darkSrc = dark === null ? source('light', light!) : source('dark', dark)

  return { src: lightSrc, darkSrc: darkSrc === lightSrc ? null : darkSrc, alt: input.alt.trim() }
}

export function buildMailBrand(input: {
  readonly boardName: string
  readonly fromName?: string
  readonly boardUrl: string
  readonly tokens?: ThemeTokenSet | null
  readonly logo?: {
    readonly lightKey: string
    readonly darkKey: string
    readonly alt: string
  }
}): MailBrand {
  const boardUrl = normaliseBoardUrl(input.boardUrl)
  const fromName = (input.fromName ?? '').trim()

  return {
    boardName: input.boardName.trim(),
    ...(fromName === '' ? {} : { fromName }),
    boardUrl,
    logo: input.logo === undefined ? null : mailLogo({ boardUrl, ...input.logo }),
    palette: input.tokens === undefined ? FALLBACK_PALETTE : mailPalette(input.tokens),
  }
}
