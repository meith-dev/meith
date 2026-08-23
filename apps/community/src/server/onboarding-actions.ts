'use server'

import { cookies } from 'next/headers'

import {
  isOnboardingPanel,
  ONBOARDING_COOKIE_MAX_AGE,
  onboardingCookieName,
} from '@/view/onboarding'

import { redirectToCurrentPath } from './redirect-back'

const COOKIE_OPTIONS = {
  path: '/',
  maxAge: ONBOARDING_COOKIE_MAX_AGE,
  sameSite: 'lax',
  httpOnly: false,
} as const

export async function dismissOnboardingAction(form: FormData): Promise<void> {
  const panel = form.get('panel')
  if (typeof panel === 'string' && isOnboardingPanel(panel)) {
    ;(await cookies()).set(onboardingCookieName(panel), '1', COOKIE_OPTIONS)
  }

  await redirectToCurrentPath()
}
