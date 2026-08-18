import 'server-only'

import { cache } from 'react'

import type { Translator } from '@meith/i18n'
import { buildMailBrand, type MailBrand } from '@meith/mail'

import { boardUrl } from './board-url'
import { getSettings } from './settings'
import { getBoardThemeStyle } from './theme-runtime'

export const mailBrand = cache(async (): Promise<MailBrand> => {
  const [settings, origin, theme] = await Promise.all([
    getSettings(),
    boardUrl(),
    getBoardThemeStyle(),
  ])

  const boardName = settings.get('board.name')
  const alt = settings.get('board.logo_alt').trim()

  return buildMailBrand({
    boardName,
    fromName: settings.get('mail.from_name'),
    boardUrl: origin,
    tokens: theme.defaultTokens,
    logo: {
      lightKey: settings.get('board.logo_light'),
      darkKey: settings.get('board.logo_dark'),
      alt: alt === '' ? boardName : alt,
    },
  })
})

export async function brandedFor(
  t: Translator,
  fallbackKey: string,
): Promise<{ readonly brand: MailBrand; readonly boardName: string }> {
  const brand = await mailBrand()
  const boardName = brand.boardName === '' ? t.t(fallbackKey) : brand.boardName

  return { brand: { ...brand, boardName }, boardName }
}
