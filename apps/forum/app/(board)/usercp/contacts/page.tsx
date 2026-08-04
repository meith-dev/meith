import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MAX_RELATIONS } from '@meith/relations'
import { requireSlot } from '@meith/theme-kit'

import { RemoveRelationForm } from '@/components/account/relation-forms'
import { getActor } from '@/server/context'
import { relationService } from '@/server/relations'
import { activeTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildContactsView, contactsNotice, type ContactRowView } from '@/view/contacts'

export const metadata: Metadata = { title: 'Buddies and ignored members' }

const RETURN_TO = '/usercp/contacts'

/**
 * F61 — the two lists, on one screen.
 *
 * One page rather than two, because they are one decision seen from either
 * side: the same member is on exactly one of them, and moving somebody between
 * them is a thing people do. Two screens would make that a delete on one page
 * and an add on another.
 *
 * App-owned rather than a theme slot, like every account screen since F55: the
 * slot registry is R6's list, frozen at F77, and this arrived after it.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; ignored?: string; removed?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const service = relationService()

  /*
   * A guest and a board with no relation store get the same answer: this page
   * is not here. Somebody's ignore list is theirs, and nothing about it should
   * be discoverable by asking for it.
   */
  if (actor.userId === null || service === null) notFound()

  const preferences = await getViewerPreferences()
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
    timeZone: preferences.timezone,
  })

  const Notice = requireSlot(activeTheme, 'Notice')
  const notice = contactsNotice(query)

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind={notice.kind} message={notice.message} dismissHref={RETURN_TO} />
        )}

        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold">Buddies and ignored members</h1>
          <p className="text-sm text-muted-foreground">
            Add somebody from their profile. {view.total} of {view.limit} used.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold">
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
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {view.buddies.map((row) => (
                <ContactLine key={row.userId} row={row} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold">Ignored</h2>
          <p className="text-sm text-muted-foreground">
            Their posts are hidden behind a link rather than removed, so a thread
            still reads in order and its numbering is the same for everybody. They
            cannot send you private messages.
          </p>

          {view.ignored.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {view.ignored.map((row) => (
                <ContactLine key={row.userId} row={row} />
              ))}
            </ul>
          )}
        </section>

        <a href="/usercp" className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          &larr; Back to your control panel
        </a>
      </div>
    </main>
  )
}

function ContactLine({ row }: { row: ContactRowView }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <a href={row.profileHref} className="text-sm font-medium text-foreground hover:underline underline-offset-2">
        {row.username}
      </a>

      {row.isOnline ? (
        /* A word as well as a dot: a colour difference alone is not a
           distinction everybody can see. */
        <span className="text-xs font-medium text-moderation-approved">Online</span>
      ) : (
        row.lastSeenLabel !== null && (
          <span className="text-xs text-muted-foreground">{row.lastSeenLabel}</span>
        )
      )}

      <span className="ml-auto flex items-center gap-4">
        {row.messageHref !== null && (
          <a href={row.messageHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
            Message
          </a>
        )}
        <RemoveRelationForm userId={row.userId} username={row.username} returnTo={RETURN_TO} />
      </span>
    </li>
  )
}
