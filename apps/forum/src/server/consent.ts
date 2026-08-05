import 'server-only'

/**
 * What this request's reader has been asked, and what they answered.
 *
 * Resolved once per request with `React.cache`, the same shape `getActor` and
 * `currentTheme` use — the root layout asks twice (once to decide whether to
 * render the analytics script, once to decide whether to render the notice) and
 * the appearance strip asks a third time.
 */
import { headers } from 'next/headers'
import { cookies } from 'next/headers'
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
  /** Whether this reader has to be asked at all. */
  readonly required: boolean
  /** Their answer, or `null` if they have not given one. */
  readonly choice: ConsentChoice | null
  /**
   * Whether optional processing — today, the analytics script — may run.
   *
   * `true` when consent is not required at all, or when it was granted. Never
   * `true` merely because nobody has answered yet: an unanswered banner is a
   * refusal until it is not, which is the whole point of asking first.
   */
  readonly analyticsAllowed: boolean
}

function mode(value: unknown): ConsentMode {
  return value === 'always' || value === 'off' ? value : 'auto'
}

export const getConsentState = cache(async (): Promise<ConsentState> => {
  /*
   * A settings read that fails must not take the page down, and must not fail
   * *open*: an unreadable settings table produces `auto`, which is the mode
   * that asks. The same reasoning as the anti-spam controls, in the opposite
   * direction — those fail open because refusing a legitimate registration is
   * the worse outcome, and this fails closed because sending somebody's data to
   * a third party is.
   */
  let configured: ConsentMode = 'auto'
  try {
    configured = mode((await getSettings()).get('privacy.cookie_consent'))
  } catch {
    /* `auto` it is. */
  }

  const country = countryFrom(await headers())
  const required = consentRequired(configured, country)

  const stored = (await cookies()).get(CONSENT_COOKIE)?.value
  const choice = isConsentChoice(stored) ? stored : null

  return { required, choice, analyticsAllowed: !required || choice === 'granted' }
})
