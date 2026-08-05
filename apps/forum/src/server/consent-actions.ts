'use server'

/**
 * Recording a reader's answer to the cookie notice.
 *
 * Like the appearance controls, this is a plain form posting to a Server
 * Action, so it works with JavaScript off — which matters more here than
 * anywhere else on the board. A consent notice that only functions with
 * scripting enabled cannot be dismissed by the readers most likely to care
 * about being asked, and a banner nobody can answer is not consent.
 *
 * ## Accepting and refusing are the same amount of work
 *
 * Two buttons, one action, one cookie, one click each. That is not a styling
 * detail: consent is not freely given if refusing is harder than agreeing, and
 * the commonest way to get that wrong is a prominent "Accept" beside a link to
 * a settings page where refusal takes three more clicks. There is no such page,
 * because there is nothing else to configure — one optional thing is either on
 * or off.
 */
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

  /*
   * `httpOnly` is false for the same reason the appearance cookies are: this is
   * a record of an answer, not a credential. It is `lax` rather than `strict`
   * so that arriving from a link does not re-open a notice somebody has already
   * dealt with.
   */
  ;(await cookies()).set(CONSENT_COOKIE, choice, {
    path: '/',
    maxAge: CONSENT_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  })

  /* The notice is rendered by the root layout; see `redirectToCurrentPath`. */
  await redirectToCurrentPath()
}
