import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MAX_RELATIONS } from '@meith/relations'
import { TextLink } from '@meith/ui'

import { RemoveRelationForm } from '@/components/account/relation-forms'
import { BoardNotice } from '@/components/shell/board-notice'
import { PANEL_LIST, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { relationService } from '@/server/relations'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildContactsView, type ContactRowView, contactsNotice } from '@/view/contacts'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.buddies-ignored-members') }
}

const RETURN_TO = '/usercp/contacts'

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; ignored?: string; removed?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const translator = await getTranslator()
  const service = relationService()

  if (actor.userId === null || service === null) notFound()

  const _preferences = await getViewerPreferences()
  const [buddies, ignored] = await Promise.all([
    service.list(actor.userId, 'buddy'),
    service.list(actor.userId, 'ignore'),
  ])

  const view = buildContactsView({
    kind: 'buddy',
    buddies,
    ignored,
    limit: MAX_RELATIONS,
    now: new Date(),
    t: await getTranslator(),
  })

  const notice = contactsNotice(query, await getTranslator())

  return (
    <PanelPage
      title={await tr('page.buddies-ignored-members')}
      lede={translator.t('board.contacts.lede', { total: view.total, limit: view.limit })}
    >
      {notice !== null && (
        <BoardNotice kind={notice.kind} message={notice.message} dismissHref={RETURN_TO} />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('board.contacts.buddies')}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {view.onlineCount > 0
              ? translator.t('board.contacts.onlineNow', { count: view.onlineCount })
              : null}
          </span>
        </h2>

        {view.buddies.length === 0 ? (
          <p className={PANEL_NOTE}>{translator.t('board.contacts.emptyBuddies')}</p>
        ) : (
          <ul className={PANEL_LIST}>
            {view.buddies.map((row) => (
              <ContactLine key={row.userId} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('board.contacts.ignored')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('board.contacts.ignoredHint')}
        </p>

        {view.ignored.length === 0 ? (
          <p className={PANEL_NOTE}>{translator.t('board.contacts.emptyIgnored')}</p>
        ) : (
          <ul className={PANEL_LIST}>
            {view.ignored.map((row) => (
              <ContactLine key={row.userId} row={row} />
            ))}
          </ul>
        )}
      </section>
    </PanelPage>
  )
}

async function ContactLine({ row }: { row: ContactRowView }) {
  const translator = await getTranslator()
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <a
        href={row.profileHref}
        className="text-sm font-medium text-foreground hover:underline underline-offset-2"
      >
        {row.username}
      </a>

      {row.isOnline ? (
        <span className="text-xs font-medium text-moderation-approved">
          {translator.t('board.contacts.online')}
        </span>
      ) : (
        row.lastSeenLabel !== null && (
          <span className="text-xs text-muted-foreground">{row.lastSeenLabel}</span>
        )
      )}

      <span className="ml-auto flex items-center gap-4">
        {row.messageHref !== null && (
          <TextLink href={row.messageHref} size="sm">
            {translator.t('board.contacts.message')}
          </TextLink>
        )}
        <RemoveRelationForm userId={row.userId} username={row.username} returnTo={RETURN_TO} />
      </span>
    </li>
  )
}
