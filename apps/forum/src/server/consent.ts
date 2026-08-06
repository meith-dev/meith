import 'server-only'

import { cookies, headers } from 'next/headers'
import { cache } from 'react'

import {
  CONSENT_COOKIE,
  consentRequired,
  countryFrom,
  isConsentChoice,
  type ConsentChoice,
  type ConsentMode,
} from '@/view/consent'

import { getSettings } from './settings'

export interface ConsentState {
  readonly required: boolean
  readonly choice: ConsentChoice | null
  readonly optionalAllowed: boolean
}

function mode(value: unknown): ConsentMode {
  return value === 'always' || value === 'off' ? value : 'auto'
}

export const getConsentState = cache(async (): Promise<ConsentState> => {
  let configured: ConsentMode = 'auto'
  try {
    configured = mode((await getSettings()).get('privacy.cookie_consent'))
  } catch {}

  const country = countryFrom(await headers())
  const required = consentRequired(configured, country)

  const stored = (await cookies()).get(CONSENT_COOKIE)?.value
  const choice = isConsentChoice(stored) ? stored : null

  return { required, choice, optionalAllowed: !required || choice === 'granted' }
})
