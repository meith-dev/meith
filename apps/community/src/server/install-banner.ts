import 'server-only'

import { cookies } from 'next/headers'

import { INSTALL_BANNER_COOKIE } from '@/view/install-banner'

import { getTranslator } from './i18n'
import { getSettings } from './settings'

export interface InstallBannerModel {
  readonly message: string
  readonly how: string
  readonly installLabel: string
  readonly dismissLabel: string
}

export async function installBanner(): Promise<InstallBannerModel | null> {
  const settings = await getSettings()
  if (!settings.get('board.install_banner')) return null
  if ((await cookies()).get(INSTALL_BANNER_COOKIE)?.value === '1') return null

  const t = await getTranslator()
  return {
    message: t.t('installBanner.message', { board: settings.get('board.name') }),
    how: t.t('installBanner.how'),
    installLabel: t.t('installBanner.install'),
    dismissLabel: t.t('installBanner.dismiss'),
  }
}
