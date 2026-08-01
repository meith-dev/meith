import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { MemberSettingsService } from '@forum/accounts'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'

export const metadata: Metadata = { title: 'Confirm your e-mail address' }

/**
 * F57 — redeeming an e-mail-change link.
 *
 * **This one acts on the GET, and that is the opposite of F56's unsubscribe
 * route.** The difference is what the link can do to somebody who did not ask
 * for it. An unsubscribe link is a bearer credential that arrives in an inbox
 * and can be fetched by a scanner, so acting on the GET would let a spam filter
 * unsubscribe a member. This link only completes a change *the signed-in member
 * initiated minutes ago*, its token is single-use, and requiring a second click
 * after they already clicked one buys nothing.
 *
 * The session still matters: the token is redeemed against whichever account it
 * was issued for, and a guest who follows it is sent to sign in rather than
 * having somebody else's address quietly confirmed by their browser.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = (await searchParams).token ?? ''
  const actor = await getActor()
  const { memberSettings, accountStore } = getContainer()

  if (memberSettings === null) notFound()
  if (actor.userId === null) {
    /*
     * Back through the front door, carrying the link so nothing is lost. The
     * token is single-use and has not been touched yet, so this costs the
     * member a sign-in and nothing else.
     */
    redirect(`/login?next=${encodeURIComponent(`/usercp/email/confirm?token=${token}`)}`)
  }

  const outcome =
    token === ''
      ? null
      : await new MemberSettingsService({
          settings: memberSettings,
          accounts: accountStore.accounts,
          sessions: accountStore.sessions,
          tokens: accountStore.tokens,
        }).confirmEmailChange(token)

  /*
   * A used, expired or forged token and an address taken in the meantime all
   * land on the same message. The screen that explains it is the security one —
   * where the form to try again lives.
   */
  redirect(outcome === null ? '/usercp/security?failed=1' : '/usercp/security?confirmed=1')
}
