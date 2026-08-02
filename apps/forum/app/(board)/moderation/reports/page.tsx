import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ReportService } from '@forum/moderation'
import { requireSlot } from '@forum/theme-kit'

import {
  AssignReportForm,
  CloseReportForm,
} from '@/components/moderation/report-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { messageService } from '@/server/messages'
import { hasReportScope, resolveReportScope } from '@/server/report-scope'
import { activeTheme } from '@/server/theme'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Reports' }

/**
 * F49 — outstanding reports, in the forums this actor moderates.
 *
 * App-owned rather than a theme slot, for the reason D47 records for the queue:
 * a moderator tool is an operator surface, and the 25-slot registry freezes at
 * F77.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; closed?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { reports } = getContainer()
  if (reports === null || actor.userId === null) notFound()

  const scope = await resolveReportScope()
  if (!hasReportScope(scope)) notFound()

  const service = new ReportService({ reports })
  const [page, open] = await Promise.all([
    service.listOpen(scope, query.after === undefined ? {} : { after: query.after }),
    service.countOpen(scope),
  ])

  /*
   * F60. A reported private message is the one target a moderator cannot open:
   * `/messages/<id>` requires a copy, and staff hold none. So the message is
   * fetched here, for the reported ids on this page only, and shown inline.
   *
   * That is the **entire** staff read path into private messages — there is no
   * listing, no search, and no way to reach the message beside it. A report is
   * the door, and it opens exactly one message.
   */
  const reportedMessages = await reportedPrivateMessages(page.rows)

  const now = new Date()
  const Notice = requireSlot(activeTheme, 'Notice')
  const notice =
    query.closed === 'resolved'
      ? 'Report resolved.'
      : query.closed === 'rejected'
        ? 'Report dismissed.'
        : null

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">{open} open</p>
        </div>

        {notice !== null && (
          <Notice kind="info" message={notice} dismissHref="/moderation/reports" />
        )}

        {page.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
        )}

        <ul className="flex flex-col gap-3">
          {page.rows.map((report) => {
            const posted = formatTime(report.createdAt, now)
            const message = reportedMessages.get(report.targetId)
            const href =
              report.kind === 'user'
                ? `/member/${report.targetId}`
                : report.kind === 'thread'
                  ? `/thread/${report.targetId}`
                  : report.kind === 'private_message'
                    ? null
                    : `/thread/${report.threadId ?? 0}#post-${report.targetId}`

            return (
              <li key={report.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium capitalize">
                    {report.kind === 'private_message' ? 'Private message' : report.kind}
                  </span>
                  {href === null ? (
                    <span className="font-medium">{report.targetLabel}</span>
                  ) : (
                    <a href={href} className="text-primary hover:underline">
                      {report.targetLabel}
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground">
                    reported by {report.reporterUsername ?? 'a deleted account'} ·{' '}
                    <time dateTime={posted.iso}>{posted.label}</time>
                  </span>
                </div>

                {/* The reporter's words, as text. Never rendered as markup. */}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {report.reason}
                </p>

                {report.kind === 'private_message' && (
                  <div className="mt-2 rounded-md border border-border bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {message === undefined
                        ? 'The reported message'
                        : `The reported message, from ${
                            message.authorUsername === '' ? 'a deleted member' : message.authorUsername
                          }`}
                    </p>
                    {/*
                      The **source**, as plain text, not the rendered HTML. A
                      moderator deciding what somebody sent should see what they
                      actually typed — and a staff screen gains nothing from a
                      second rendering surface for attacker-controlled markup.
                    */}
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {message?.message ?? 'This message has since been deleted by everybody who held it.'}
                    </p>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {report.assignedToUsername === null
                      ? 'Unassigned'
                      : `Assigned to ${report.assignedToUsername}`}
                  </span>
                  <AssignReportForm
                    reportId={report.id}
                    mine={report.assignedToUserId === actor.userId}
                  />
                </div>

                <CloseReportForm reportId={report.id} />
              </li>
            )
          })}
        </ul>

        {page.nextCursor !== undefined && (
          <a
            href={`/moderation/reports?after=${encodeURIComponent(page.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Older reports
          </a>
        )}
      </div>
    </main>
  )
}

/**
 * The bodies of the private messages this page's reports point at.
 *
 * Bounded by the page size, and only for reports that are actually about a
 * message — a page of post reports costs nothing. Failures are swallowed to an
 * absent entry rather than taking down the queue: a moderator with one
 * unreadable row can still work the other twenty-four.
 */
async function reportedPrivateMessages(
  rows: readonly { kind: string; targetId: number }[],
): Promise<ReadonlyMap<number, { authorUsername: string; message: string }>> {
  const ids = rows.filter((row) => row.kind === 'private_message').map((row) => row.targetId)
  if (ids.length === 0) return new Map()

  const service = messageService()
  if (service === null) return new Map()

  const found = new Map<number, { authorUsername: string; message: string }>()
  for (const id of new Set(ids)) {
    const message = await service.forReport(id).catch(() => null)
    if (message !== null) {
      found.set(id, { authorUsername: message.authorUsername, message: message.message })
    }
  }
  return found
}
