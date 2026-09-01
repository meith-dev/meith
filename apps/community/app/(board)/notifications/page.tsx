import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { NOTIFICATIONS_PAGE_SIZE } from '@meith/notifications'
import { TextLink } from '@meith/ui'

import {
  MarkAllNotificationsReadForm,
  MarkNotificationReadForm,
} from '@/components/account/notification-forms'
import { BoardNotice } from '@/components/shell/board-notice'
import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { notificationService } from '@/server/notifications'
import { notificationFormsCopy } from '@/view/account-copy'
import { buildNotificationCentreView, notificationNotice } from '@/view/notifications'
import { offsetOf, readPage } from '@/view/pager'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.notifications') }
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; read?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const service = notificationService()

  if (actor.userId === null || service === null) notFound()

  const pageNumber = readPage(query)
  const translator = await getTranslator()
  const [page, unread, total] = await Promise.all([
    service.list(
      actor.userId,
      { offset: offsetOf(pageNumber, NOTIFICATIONS_PAGE_SIZE) },
      translator,
    ),
    service.unreadCount(actor.userId),
    service.count(actor.userId),
  ])

  const view = buildNotificationCentreView({
    rows: page.rows,
    unread,
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    now: new Date(),
    t: translator,
  })

  const notice = notificationNotice(query, await getTranslator())

  return (
    <PanelPage
      title={await tr('page.notifications')}
      lede={
        <>
          {translator.t('board.notifications.unread', { count: view.unread })}{' '}
          <TextLink href={view.preferencesHref}>
            {await tr('page.choose-which-these-receive-by')}
          </TextLink>
          .
        </>
      }
      actions={
        <MarkAllNotificationsReadForm
          unread={view.unread}
          copy={notificationFormsCopy(translator)}
        />
      }
    >
      {notice !== null && <BoardNotice kind="info" message={notice} dismissHref="/notifications" />}

      {view.rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {translator.t('board.notifications.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.rows.map((row) => (
            <li
              key={row.id}
              className={`rounded-lg border p-4 ${
                row.isRead ? 'border-border bg-card' : 'border-primary bg-card'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {row.isRead ? null : (
                    <span className="mr-2 text-xs font-semibold uppercase text-forum-unread">
                      {translator.t('board.notifications.new')}
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
                  <TextLink href={row.href} size="sm">
                    {translator.t('board.notifications.view')}
                  </TextLink>
                )}
                {!row.isRead && (
                  <MarkNotificationReadForm
                    notificationId={row.id}
                    copy={notificationFormsCopy(translator)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <PanelPagination
        path="/notifications"
        params={query}
        page={pageNumber}
        pageSize={NOTIFICATIONS_PAGE_SIZE}
        total={total}
      />
    </PanelPage>
  )
}
