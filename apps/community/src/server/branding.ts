import 'server-only'

import { cache } from 'react'

import { CacheTags } from '@meith/core'
import { getDb, PostgresSettingsRepository } from '@meith/db'
import { drivers } from '@meith/drivers'
import { isLogoKey, type LogoScheme, logoPath, saveSettings } from '@meith/settings'

import { forgetImage, storeImage } from './image-upload'
import { getSettings } from './settings'
import { currentColourScheme } from './theme'

export const LOGO_FIELD = 'logo'

export { isLogoScheme, type LogoScheme } from '@meith/settings'

const SETTING_FOR: Record<LogoScheme, 'board.logo_light' | 'board.logo_dark'> = {
  light: 'board.logo_light',
  dark: 'board.logo_dark',
}

async function writeSetting(key: string, value: string): Promise<void> {
  const result = await saveSettings(
    new PostgresSettingsRepository(getDb()),
    { [key]: value },
    await getSettings(),
  )

  if (result.changed.length > 0) {
    await drivers().cache.invalidateTags([CacheTags.settings(), ...result.invalidates])
  }
}

export async function saveLogo(scheme: LogoScheme, file: File): Promise<void> {
  const key = await storeImage('board', `logo-${scheme}`, file)

  const previous = (await getSettings()).get(SETTING_FOR[scheme])
  await writeSetting(SETTING_FOR[scheme], key)

  if (previous !== key) await forgetImage(previous)
}

export async function removeLogo(scheme: LogoScheme): Promise<void> {
  const previous = (await getSettings()).get(SETTING_FOR[scheme])
  await writeSetting(SETTING_FOR[scheme], '')

  await forgetImage(previous)
}

export async function logoKey(scheme: LogoScheme): Promise<string | null> {
  const key = (await getSettings()).get(SETTING_FOR[scheme])
  return isLogoKey(key) ? key : null
}

export const logoSrc = logoPath

export interface BoardLogo {
  readonly src: string
  readonly darkSrc: string | null
  readonly alt: string
}

export function resolveLogo(input: {
  readonly lightKey: string | null
  readonly darkKey: string | null
  readonly scheme: 'light' | 'dark' | 'system'
  readonly alt: string
  readonly boardTitle: string
}): BoardLogo | null {
  const alt = input.alt.trim() === '' ? input.boardTitle : input.alt.trim()

  const light = input.lightKey ?? input.darkKey
  const dark = input.darkKey ?? input.lightKey
  if (light === null || dark === null) return null

  const lightSrc = logoSrc(input.lightKey === null ? 'dark' : 'light', light)
  const darkSrc = logoSrc(input.darkKey === null ? 'light' : 'dark', dark)

  if (input.scheme === 'light') return { src: lightSrc, darkSrc: null, alt }
  if (input.scheme === 'dark') return { src: darkSrc, darkSrc: null, alt }

  return { src: lightSrc, darkSrc: darkSrc === lightSrc ? null : darkSrc, alt }
}

export const currentLogo = cache(async (boardTitle: string): Promise<BoardLogo | null> => {
  const [settings, scheme, lightKey, darkKey] = await Promise.all([
    getSettings(),
    currentColourScheme(),
    logoKey('light'),
    logoKey('dark'),
  ])

  return resolveLogo({
    lightKey,
    darkKey,
    scheme,
    alt: settings.get('board.logo_alt'),
    boardTitle,
  })
})
