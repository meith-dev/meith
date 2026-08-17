import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { REPORTS_PAGE_SIZE, ReportService } from '@meith/moderation'
import { requireSlot } from '@meith/theme-kit'
import { Card, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { AssignReportForm, CloseReportForm } from '@/components/moderation/report-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { messageService } from '@/server/messages'
import { hasReportScope, resolveReportScope } from '@/server/report-scope'
import { currentTheme } from '@/server/theme'
import { offsetOf, readPage } from '@/view/pager'
import { postLink } from '@/view/post-link'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.reports') }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; closed?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { reports } = getContainer()
  if (reports === null || actor.userId === null) notFound()

  const scope = await resolveReportScope()
  if (!hasReportScope(scope)) notFound()

  const service = new ReportService({ reports })
  const pageNumber = readPage(query)
  const [page, open] = await Promise.all([
    service.listOpen(scope, { offset: offsetOf(pageNumber, REPORTS_PAGE_SIZE) }),
    service.countOpen(scope),
  ])

  const reportedMessages = await reportedPrivateMessages(page.rows)

  const now = new Date()
  const translator = await getTranslator()
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice =
    query.closed === 'resolved'
      ? 'Report resolved.'
      : query.closed === 'rejected'
        ? 'Report dismissed.'
        : null

  return (
    <PanelPage
      title={await tr('page.reports')}
      lede={open === 1 ? '1 report still open.' : `${open} reports still open.`}
    >
      {notice !== null && <Notice kind="info" message={notice} dismissHref="/moderation/reports" />}

      {page.rows.length === 0 && (
        <Card>
          <Empty className="py-8">
            <EmptyTitle>{await tr('page.nothing-outstanding')}</EmptyTitle>
            <EmptyDescription>{await tr('page.every-report-forums-moderate-has')}</EmptyDescription>
          </Empty>
        </Card>
      )}

      {page.rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {page.rows.map((report) => {
            const posted = formatTime(report.createdAt, now, translator)
            const message = reportedMessages.get(report.targetId)
            const href =
              report.kind === 'user'
                ? `/member/${report.targetId}`
                : report.kind === 'thread'
                  ? `/thread/${report.targetId}`
                  : report.kind === 'private_message'
                    ? null
                    : postLink(`/thread/${report.threadId ?? 0}`, report.targetId)

            return (
              <li
                key={report.id}
                className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-elevation"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium capitalize">
                    {report.kind === 'private_message' ? 'Private message' : report.kind}
                  </span>
                  {href === null ? (
                    <span className="font-medium">{report.targetLabel}</span>
                  ) : (
                    <a
                      href={href}
                      className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                    >
                      {report.targetLabel}
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground">
                    reported by {report.reporterUsername ?? 'a deleted account'} ·{' '}
                    <time dateTime={posted.iso}>{posted.label}</time>
                  </span>
                </div>

                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {report.reason}
                </p>

                {report.kind === 'private_message' && (
                  <div className="mt-2 rounded-md border border-border bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {message === undefined
                        ? 'The reported message'
                        : `The reported message, from ${
                            message.authorUsername === ''
                              ? 'a deleted member'
                              : message.authorUsername
                          }`}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {message?.message ??
                        'This message has since been deleted by everybody who held it.'}
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
      )}

      <PanelPagination
        path="/moderation/reports"
        params={query}
        page={pageNumber}
        pageSize={REPORTS_PAGE_SIZE}
        total={open}
      />
    </PanelPage>
  )
}

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
      found.set(id, {
        authorUsername: message.authorUsername,
        message: message.message,
      })
    }
  }
  return found
}
