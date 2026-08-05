import type { Metadata } from 'next'

import { env } from '@meith/core'
import { readUnsubscribeToken } from '@meith/subscriptions'
import { requireSlot } from '@meith/theme-kit'

import { UnsubscribeConfirmForm } from '@/components/account/subscription-forms'
import { currentTheme } from '@/server/theme'
import { unsubscribeNotice } from '@/view/subscriptions'

export const metadata: Metadata = { title: 'Unsubscribe' }

/**
 * F56 — unsubscribing without signing in.
 *
 * The link in a notification e-mail lands here. Two rules shape the page.
 *
 * **The GET does nothing.** It reads the token, says what unsubscribing would
 * do, and offers one button. Acting on the GET would mean a member is
 * unsubscribed by their own mail client, their employer's link scanner, or a
 * preview fetch — none of which are the member deciding anything. The act is
 * the POST.
 *
 * **A bad token and a valid one look the same until the button.** The page
 * renders the same shape for any well-formed request; only the description
 * differs, and it never names the member. Somebody holding a forged token
 * learns nothing about whether a user id exists.
 *
 * No `getActor()` call anywhere on this page, deliberately: it must work in a
 * browser with no session, and reading one would tempt a future change into
 * using it.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  const query = await searchParams
  const done = unsubscribeNotice(query.done)

  const token = query.token ?? ''
  const secret = env.AUTH_SECRET
  const claim =
    token === '' || secret === undefined ? null : readUnsubscribeToken(token, secret)

  const Notice = requireSlot(await currentTheme(), 'Notice')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">
        <h1 className="font-serif text-2xl font-semibold">Unsubscribe</h1>

        {done !== null ? (
          <>
            <Notice kind="info" message={done} dismissHref="/" />
            <p className="text-sm text-muted-foreground">
              You can change any of this later from{' '}
              <a href="/subscriptions" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                your subscriptions
              </a>
              .
            </p>
          </>
        ) : claim === null ? (
          <p className="text-sm text-muted-foreground">
            That link is not valid — it may have been truncated by a mail client,
            or the board’s settings may have changed since it was sent. You can
            still manage everything from{' '}
            <a href="/subscriptions" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              your subscriptions
            </a>{' '}
            after signing in.
          </p>
        ) : (
          <UnsubscribeConfirmForm
            token={token}
            description={
              claim.scope === 'email'
                ? 'This will stop subscription e-mails. What you follow stays as it is, and new posts will still appear in your notifications on the board.'
                : 'This will stop notifications about the thread or forum this message was about. Everything else you follow stays as it is.'
            }
          />
        )}
      </div>
    </main>
  )
}
