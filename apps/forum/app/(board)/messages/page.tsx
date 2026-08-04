import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { parseFolder } from '@meith/messages'
import { requireSlot } from '@meith/theme-kit'

import { MessageActionBar } from '@/components/messages/message-forms'
import { getContainer } from '@/server/container'
import { ViewTabs } from '@/components/shell/view-tabs'
import { getActor } from '@/server/context'
import { messageService } from '@/server/messages'
import { activeTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import {
  MESSAGE_FORM_ID,
  buildMessageFolderView,
  messageNotice,
} from '@/view/messages'

export const metadata: Metadata = { title: 'Private messages' }

/**
 * F60 — a folder of private messages.
 *
 * One route for all three folders rather than three, because they differ only
 * in a `where` clause and in which actions the bar offers. Three pages would be
 * three chances for the ownership scoping to be written differently.
 *
 * **Nothing is marked read here.** Opening a folder is not reading a message,
 * and a member who came back to find something they had not got to yet has lost
 * it. Reading happens on the message's own page, one at a time and by choice.
 *
 * App-owned rather than a theme slot, like F55's centre and F56's list: the
 * slot registry is R6's list, frozen at F77, and this arrived after it. The
 * theme still supplies everything around it, and the unread badge that leads
 * here is a `UserPanelModel` field the contract has carried since F27.
 */
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

  /*
   * A guest, a member whose groups do not grant `pm.use`, and a board with no
   * message store all get the same answer: this page is not here. Not a
   * redirect to the login screen — a mailbox is private, and nothing about it
   * should be discoverable by asking for it.
   */
  if (actor.userId === null || service === null) notFound()
  if (!authorizer.can(actor, 'pm.use')) notFound()

  const folder = parseFolder(query.folder ?? 'inbox') ?? 'inbox'
  const before = Number(query.before)

  const preferences = await getViewerPreferences()
  const [page, counts] = await Promise.all([
    service.list({
      userId: actor.userId,
      folder,
      ...(Number.isInteger(before) && before > 0 ? { before } : {}),
    }),
    service.counts(actor.userId),
  ])

  const view = buildMessageFolderView({
    folder,
    rows: page.rows,
    counts,
    /*
     * The member's own quota, from the one place allowed to resolve it. Shown
     * rather than only enforced: a send refused for a full store is a bad way
     * to learn the store has a size.
     */
    quota: authorizer.globalLimit(actor, 'privateMessageQuota'),
    nextBefore: page.nextBefore,
    now: new Date(),
    timeZone: preferences.timezone,
  })

  const Notice = requireSlot(activeTheme, 'Notice')
  const notice = messageNotice(query)

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind={notice.kind} message={notice.message} dismissHref={view.tabs[0]?.href ?? '/messages'} />
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold">Private messages</h1>
          <a href={view.composeHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
            Write a message
          </a>
        </div>

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
            Your message store is full, so you cannot send or receive anything until
            you delete some. Emptying the trash frees space — messages in it still count.
          </p>
        ) : view.quota.isNearlyFull ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            Your message store is nearly full. Deleting messages and emptying the
            trash frees space.
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
                  {/*
                    Associated with the bar's form by the `form` attribute, so a
                    native submit carries it with scripting off (F52). The label
                    is the subject, because a screen-reader user tabbing a full
                    folder otherwise hears "checkbox" twenty-five times.
                  */}
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
                      {/* Unread is a word as well as a weight: a difference in
                          font weight alone is not one everybody can see. */}
                      {row.isUnread && (
                        <span className="mr-2 text-xs font-semibold uppercase text-forum-unread">New</span>
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

        {view.nextHref !== null && (
          <a href={view.nextHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
            Older messages
          </a>
        )}
      </div>
    </main>
  )
}
