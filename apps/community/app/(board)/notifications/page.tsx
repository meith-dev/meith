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
import { getViewerPreferences } from '@/server/viewer-preferences'
import { currentTheme } from '@/server/theme'
import { buildNotificationCentreView, notificationNotice } from '@/view/notifications'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; read?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const service = notificationService()

  if (actor.userId === null || service === null) notFound()

  const [page, unread] = await Promise.all([
    service.list(actor.userId, query.after === undefined ? {} : { after: query.after }),
    service.unreadCount(actor.userId),
  ])

  const { timezone } = await getViewerPreferences()

  const view = buildNotificationCentreView({
    rows: page.rows,
    unread,
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    now: new Date(),
    timeZone: timezone,
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
                  :
                    'border-primary bg-card'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {row.isRead ? null : (
                    <span className="mr-2 text-xs font-semibold uppercase text-forum-unread">
                      New
                    </span>
                  )}
                  {row.subject}
                </span>
                <span className="text-xs text-muted-foreground">
                  <time dateTime={row.at.iso}>{row.at.label}</time>
                </span>
              </div>

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
