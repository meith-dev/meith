import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import {
  MarkAllNotificationsReadForm,
  MarkNotificationReadForm,
} from '@/components/account/notification-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { notificationService } from '@/server/notifications'
import { currentTheme } from '@/server/theme'
import { buildNotificationCentreView, notificationNotice } from '@/view/notifications'

export const metadata: Metadata = { title: 'Notifications' }

/**
 * F55 — the notification centre.
 *
 * The board's record of what a member has been told, and the reason on-site
 * delivery is not a preference: e-mail can be declined, but this cannot be
 * switched off, because a member who can erase the record can later say they
 * were never warned with the board's own data agreeing.
 *
 * App-owned rather than a theme slot, for F48's and F53's reason: the slot
 * registry is R6's list, frozen at F77, and this screen arrived after it. The
 * theme still supplies everything around it, and the unread badge that leads
 * here is a `UserPanelModel` field the contract has carried since F27.
 *
 * **Opening the centre does not mark anything read.** Coming back to find
 * everything already marked is how a member loses the one thing they came to
 * re-read; marking is an explicit act, per row or for everything at once.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; read?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const service = notificationService()

  /*
   * A guest and a board with no notification store get the same answer: this
   * page is not here. Not a redirect to the login screen — a member's centre is
   * theirs, and nothing about it should be discoverable by asking for it.
   */
  if (actor.userId === null || service === null) notFound()

  const [page, unread] = await Promise.all([
    service.list(actor.userId, query.after === undefined ? {} : { after: query.after }),
    service.unreadCount(actor.userId),
  ])

  const view = buildNotificationCentreView({
    rows: page.rows,
    unread,
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    now: new Date(),
  })

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = notificationNotice(query)

  return (
    <PanelPage
      title="Notifications"
      lede={
        <>
          {view.unread === 0 ? 'Nothing unread.' : `${view.unread} unread.`}{' '}
          <a
            href={view.preferencesHref}
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            Choose which of these you receive by e-mail
          </a>
          .
        </>
      }
      actions={<MarkAllNotificationsReadForm unread={view.unread} />}
    >
      {notice !== null && (
        <Notice kind="info" message={notice} dismissHref="/notifications" />
      )}

      {view.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no notifications. When a moderator warns you, or a report you filed is
          closed, it will appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.rows.map((row) => (
            <li
              key={row.id}
              className={`rounded-lg border p-4 ${
                row.isRead
                  ? 'border-border bg-card'
                  : /* Unread is a border, not only a background: a colour
                         difference alone is not a distinction everyone can see. */
                    'border-primary bg-card'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {row.isRead ? null : (
                    <span className="mr-2 text-xs font-semibold uppercase text-community-unread">
                      New
                    </span>
                  )}
                  {row.subject}
                </span>
                <span className="text-xs text-muted-foreground">
                  <time dateTime={row.at.iso}>{row.at.label}</time>
                </span>
              </div>

              {/*
                  Plain text, never markup. A notification body is assembled by
                  the board from captured facts, and rendering it as Markdown
                  would give a username capabilities it was never granted.
                */}
              {row.body !== '' && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.body}</p>
              )}

              {row.repeated !== null && (
                <p className="mt-1 text-xs text-muted-foreground">{row.repeated}</p>
              )}

              <div className="mt-3 flex items-center gap-4">
                {row.href !== null && (
                  <a
                    href={row.href}
                    className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    View
                  </a>
                )}
                {!row.isRead && <MarkNotificationReadForm notificationId={row.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {view.nextHref !== null && (
        <a
          href={view.nextHref}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          Older notifications
        </a>
      )}
    </PanelPage>
  )
}
