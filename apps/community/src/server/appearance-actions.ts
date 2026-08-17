'use server'

import { cookies } from 'next/headers'

import {
  isColourScheme,
  PREFERENCE_COOKIE_MAX_AGE,
  SCHEME_COOKIE,
  THEME_COOKIE,
} from '@/view/theme-preference'

import { redirectToCurrentPath } from './redirect-back'
import { getBoardThemeStyle } from './theme-runtime'

const COOKIE_OPTIONS = {
  path: '/',
  maxAge: PREFERENCE_COOKIE_MAX_AGE,
  sameSite: 'lax',
  httpOnly: false,
} as const

export async function setAppearanceAction(form: FormData): Promise<void> {
  const jar = await cookies()

  const scheme = form.get('scheme')
  if (typeof scheme === 'string' && isColourScheme(scheme)) {
    jar.set(SCHEME_COOKIE, scheme, COOKIE_OPTIONS)
  }

  const theme = form.get('theme')
  if (typeof theme === 'string' && theme !== '') {
    const { choices } = await getBoardThemeStyle()
    if (choices.some((choice) => choice.key === theme)) {
      jar.set(THEME_COOKIE, theme, COOKIE_OPTIONS)
    }
  }

  await redirectToCurrentPath()
}
