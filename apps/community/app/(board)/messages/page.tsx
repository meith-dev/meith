import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MESSAGES_PAGE_SIZE, parseFolder } from '@meith/messages'
import { requireSlot } from '@meith/theme-kit'

import { MessageActionBar } from '@/components/messages/message-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { ViewTabs } from '@/components/shell/view-tabs'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { messageService } from '@/server/messages'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildMessageFolderView, MESSAGE_FORM_ID, messageNotice } from '@/view/messages'
import { offsetOf, readPage } from '@/view/pager'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.private-messages') }
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    folder?: string
    before?: string
    sent?: string
    moved?: string
    deleted?: string
    marked?: string
    emptied?: string
  }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { authorizer } = getContainer()
  const service = messageService()

  if (actor.userId === null || service === null) notFound()
  if (!authorizer.can(actor, 'pm.use')) notFound()

  const folder = parseFolder(query.folder ?? 'inbox') ?? 'inbox'
  const pageNumber = readPage(query)

  const _preferences = await getViewerPreferences()
  const [page, counts] = await Promise.all([
    service.list({
      userId: actor.userId,
      folder,
      offset: offsetOf(pageNumber, MESSAGES_PAGE_SIZE),
    }),
    service.counts(actor.userId),
  ])

  const view = buildMessageFolderView({
    folder,
    rows: page.rows,
    counts,
    quota: authorizer.globalLimit(actor, 'privateMessageQuota'),
    nextBefore: page.nextBefore,
    now: new Date(),
    t: await getTranslator(),
  })

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = messageNotice(query, await getTranslator())

  return (
    <PanelPage
      title={await tr('page.private-messages')}
      actions={
        <a
          href={view.composeHref}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          {await tr('page.write-message')}
        </a>
      }
    >
      {notice !== null && (
        <Notice
          kind={notice.kind}
          message={notice.message}
          dismissHref={view.tabs[0]?.href ?? '/messages'}
        />
      )}

      <ViewTabs
        label="Message folders"
        tabs={view.tabs.map((tab) => ({
          href: tab.href,
          label: tab.label,
          isCurrent: tab.isCurrent,
          count: tab.count,
        }))}
        aside={view.quota.label}
      />

      {view.quota.isFull ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Your message store is full, so you cannot send or receive anything until you delete some.
          Emptying the trash frees space — messages in it still count.
        </p>
      ) : view.quota.isNearlyFull ? (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {await tr('page.message-store-nearly-full-deleting')}
        </p>
      ) : null}

      {view.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {folder === 'inbox'
            ? 'No messages. When somebody writes to you, it will appear here.'
            : folder === 'sent'
              ? 'You have not sent anything yet.'
              : 'The trash is empty.'}
        </p>
      ) : (
        <>
          <MessageActionBar formId={MESSAGE_FORM_ID} folder={folder} />

          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {view.rows.map((row) => (
              <li key={row.copyId} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  form={MESSAGE_FORM_ID}
                  name="copyId"
                  value={row.copyId}
                  aria-label={`Select “${row.subject}”`}
                  className="mt-1 size-4 rounded border-border"
                />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <a
                    href={row.href}
                    className={
                      row.isUnread
                        ? 'truncate text-sm font-semibold text-foreground hover:underline underline-offset-2'
                        : 'truncate text-sm text-foreground hover:underline underline-offset-2'
                    }
                  >
                    {row.isUnread && (
                      <span className="mr-2 text-xs font-semibold uppercase text-forum-unread">
                        New
                      </span>
                    )}
                    {row.subject}
                  </a>
                  <span className="truncate text-xs text-muted-foreground">
                    {row.peopleLabel}: {row.people}
                  </span>
                </div>

                <time dateTime={row.at.iso} className="shrink-0 text-xs text-muted-foreground">
                  {row.at.label}
                </time>
              </li>
            ))}
          </ul>
        </>
      )}

      <PanelPagination
        path="/messages"
        params={query}
        page={pageNumber}
        pageSize={MESSAGES_PAGE_SIZE}
        total={counts[folder === 'sent' ? 'sent' : folder === 'trash' ? 'trash' : 'inbox']}
      />
    </PanelPage>
  )
}
