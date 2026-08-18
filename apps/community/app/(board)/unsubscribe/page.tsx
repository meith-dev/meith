import type { Metadata } from 'next'

import { env } from '@meith/core'
import { readUnsubscribeToken } from '@meith/subscriptions'
import { requireSlot, slotCopy } from '@meith/theme-kit'

import { UnsubscribeConfirmForm } from '@/components/account/subscription-forms'
import { getTranslator, tr } from '@/server/i18n'
import { currentTheme } from '@/server/theme'
import { followFormCopy } from '@/view/account-copy'
import { unsubscribeNotice } from '@/view/subscriptions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.unsubscribe') }
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  const query = await searchParams
  const done = unsubscribeNotice(query.done, await getTranslator())

  const token = query.token ?? ''
  const secret = env.AUTH_SECRET
  const claim = token === '' || secret === undefined ? null : readUnsubscribeToken(token, secret)

  const Notice = requireSlot(await currentTheme(), 'Notice')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">
        <h1 className="font-heading text-2xl font-semibold">Unsubscribe</h1>

        {done !== null ? (
          <>
            <Notice
              kind="info"
              message={done}
              dismissHref="/"
              copy={slotCopy(await currentTheme(), 'Notice', await getTranslator())}
            />
            <p className="text-sm text-muted-foreground">
              You can change any of this later from{' '}
              <a
                href="/subscriptions"
                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                your subscriptions
              </a>
              .
            </p>
          </>
        ) : claim === null ? (
          <p className="text-sm text-muted-foreground">
            That link is not valid — it may have been truncated by a mail client, or the board’s
            settings may have changed since it was sent. You can still manage everything from{' '}
            <a
              href="/subscriptions"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              your subscriptions
            </a>{' '}
            after signing in.
          </p>
        ) : (
          <UnsubscribeConfirmForm
            token={token}
            description={
              claim.scope === 'email'
                ? await tr('page.unsubscribe.emailScope')
                : await tr('page.unsubscribe.targetScope')
            }
            copy={followFormCopy(await getTranslator())}
          />
        )}
      </div>
    </main>
  )
}
