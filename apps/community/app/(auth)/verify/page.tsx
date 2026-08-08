import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import type { ActivationOutcome } from '@meith/accounts'

import { configuredIdentity } from '@/server/container'

export const metadata: Metadata = { title: 'Confirm your account' }

/**
 * F18 — redeeming a verification link.
 *
 * **This acts on the GET**, like F57's e-mail-change confirmation and unlike
 * F56's unsubscribe. The trade-off is not the same as either, so it is worth
 * writing down rather than pointing at a precedent.
 *
 * What makes acting on a GET dangerous is a mail scanner: security appliances
 * and spam filters follow links in mail before a person sees them, so a link
 * that *does* something does it whether or not anybody clicked. F56 refuses to
 * act on the GET for exactly that reason — a scanner following an unsubscribe
 * link would silently switch off mail the member asked for, acting against
 * their interest.
 *
 * Here the scanner completes an activation the registrant requested minutes ago
 * by filling in the registration form. The worst it can do is finish the thing
 * the person was about to finish, so the risk is the wrong shape to defend
 * against, and a confirm button would cost every member an extra click to
 * prevent an outcome nobody minds.
 *
 * The other difference from F57 matters more: **the visitor here is a guest**.
 * That route can send an unauthenticated visitor to sign in and pick the link
 * back up, because the change belongs to a signed-in member. This one cannot —
 * a member who has not activated *cannot sign in*, which is the entire point of
 * the state. So the token alone has to be enough, and it is: it was mailed to
 * the address being proven, it is single-use, and redeeming it activates the
 * account it was issued for and no other.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = (await searchParams).token ?? ''

  const outcome =
    token === '' ? 'invalid' : await (await configuredIdentity()).activateAccount(token)

  redirect(DESTINATION[outcome])
}

/**
 * Where each outcome lands. All five are the sign-in screen, which is where
 * somebody who just confirmed an account wants to be and where the copy for
 * each case lives.
 *
 * Two of them deliberately share a destination:
 *
 *  - `invalid` covers a forged token, a used one and an expired one. Separating
 *    "expired" from "never existed" would tell whoever holds a token whether it
 *    was ever real, and a member with a dead link needs the same next step
 *    either way — which is on that screen.
 *  - `banned` says the same thing rather than naming the ban. F19's login
 *    refusal is where a ban is reported, to somebody who has at least proven
 *    the password; whoever followed this link has proven only that they can
 *    read the mailbox.
 */
const DESTINATION: Record<ActivationOutcome, string> = {
  activated: '/login?activated=1',
  'awaiting-approval': '/login?confirmed=1',
  'already-active': '/login?already=1',
  banned: '/login?verify=failed',
  invalid: '/login?verify=failed',
}
