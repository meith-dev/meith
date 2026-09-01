'use server'

import { cookies } from 'next/headers'

import { INSTALL_BANNER_COOKIE, INSTALL_BANNER_COOKIE_MAX_AGE } from '@/view/install-banner'

import { redirectToCurrentPath } from './redirect-back'

export async function dismissInstallBannerAction(): Promise<void> {
  ;(await cookies()).set(INSTALL_BANNER_COOKIE, '1', {
    path: '/',
    maxAge: INSTALL_BANNER_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  })

  await redirectToCurrentPath()
}
