import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MAX_RELATIONS } from '@meith/relations'
import { requireSlot } from '@meith/theme-kit'

import { RemoveRelationForm } from '@/components/account/relation-forms'
import { PANEL_LIST } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { relationService } from '@/server/relations'
import { currentTheme } from '@/server/theme'
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

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = contactsNotice(query, await getTranslator())

  return (
    <PanelPage
      title={await tr('page.buddies-ignored-members')}
      lede={`Add somebody from their profile. ${view.total} of ${view.limit} used.`}
    >
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref={RETURN_TO} />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          Buddies{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {view.onlineCount > 0 ? `${view.onlineCount} online now` : null}
          </span>
        </h2>

        {view.buddies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody yet. There is a link on every member&rsquo;s profile.
          </p>
        ) : (
          <ul className={PANEL_LIST}>
            {view.buddies.map((row) => (
              <ContactLine key={row.userId} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Ignored</h2>
        <p className="text-sm text-muted-foreground">
          Their posts are hidden behind a link rather than removed, so a thread still reads in order
          and its numbering is the same for everybody. They cannot send you private messages.
        </p>

        {view.ignored.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody.</p>
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

function ContactLine({ row }: { row: ContactRowView }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <a
        href={row.profileHref}
        className="text-sm font-medium text-foreground hover:underline underline-offset-2"
      >
        {row.username}
      </a>

      {row.isOnline ? (
        <span className="text-xs font-medium text-moderation-approved">Online</span>
      ) : (
        row.lastSeenLabel !== null && (
          <span className="text-xs text-muted-foreground">{row.lastSeenLabel}</span>
        )
      )}

      <span className="ml-auto flex items-center gap-4">
        {row.messageHref !== null && (
          <a
            href={row.messageHref}
            className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            Message
          </a>
        )}
        <RemoveRelationForm userId={row.userId} username={row.username} returnTo={RETURN_TO} />
      </span>
    </li>
  )
}
