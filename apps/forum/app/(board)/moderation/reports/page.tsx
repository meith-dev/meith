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
            const href =
              report.kind === 'user'
                ? `/member/${report.targetId}`
                : report.kind === 'thread'
                  ? `/thread/${report.targetId}`
                  : `/thread/${report.threadId ?? 0}#post-${report.targetId}`

            return (
              <li key={report.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium capitalize">{report.kind}</span>
                  <a href={href} className="text-primary hover:underline">
                    {report.targetLabel}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    reported by {report.reporterUsername ?? 'a deleted account'} ·{' '}
                    <time dateTime={posted.iso}>{posted.label}</time>
                  </span>
                </div>

                {/* The reporter's words, as text. Never rendered as markup. */}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {report.reason}
                </p>

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
