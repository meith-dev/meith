'use server'

import { cookies } from 'next/headers'

import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  isConsentChoice,
} from '@/view/consent'

import { redirectToCurrentPath } from './redirect-back'

export async function setConsentAction(form: FormData): Promise<void> {
  const choice = form.get('consent')
  if (typeof choice !== 'string' || !isConsentChoice(choice)) return

  ;(await cookies()).set(CONSENT_COOKIE, choice, {
    path: '/',
    maxAge: CONSENT_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  })

  await redirectToCurrentPath()
}
