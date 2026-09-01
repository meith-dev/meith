import type { Metadata } from 'next'

import { env } from '@meith/core'
import { readUnsubscribeToken } from '@meith/subscriptions'
import { TextLink } from '@meith/ui'

import { UnsubscribeConfirmForm } from '@/components/account/subscription-forms'
import { BoardNotice } from '@/components/shell/board-notice'
import { getTranslator, tr } from '@/server/i18n'
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
  const translator = await getTranslator()
  const done = unsubscribeNotice(query.done, translator)

  const token = query.token ?? ''
  const secret = env.AUTH_SECRET
  const claim = token === '' || secret === undefined ? null : readUnsubscribeToken(token, secret)

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">
        <h1 className="font-heading text-2xl font-semibold">{translator.t('page.unsubscribe')}</h1>

        {done !== null ? (
          <>
            <BoardNotice kind="info" message={done} dismissHref="/" />
            <p className="text-sm text-muted-foreground">
              {translator.t('unsubscribePage.doneBefore')}{' '}
              <TextLink href="/subscriptions">
                {translator.t('unsubscribePage.subscriptions')}
              </TextLink>
              {translator.t('unsubscribePage.doneAfter')}
            </p>
          </>
        ) : claim === null ? (
          <p className="text-sm text-muted-foreground">
            {translator.t('unsubscribePage.invalidBefore')}{' '}
            <TextLink href="/subscriptions">
              {translator.t('unsubscribePage.subscriptions')}
            </TextLink>{' '}
            {translator.t('unsubscribePage.invalidAfter')}
          </p>
        ) : (
          <UnsubscribeConfirmForm
            token={token}
            description={
              claim.scope === 'mass-mail'
                ? await tr('page.unsubscribe.massMailScope')
                : claim.scope === 'email'
                  ? await tr('page.unsubscribe.emailScope')
                  : await tr('page.unsubscribe.targetScope')
            }
            copy={followFormCopy(translator)}
          />
        )}
      </div>
    </main>
  )
}
