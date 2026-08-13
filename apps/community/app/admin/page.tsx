import { ModerationQueue } from '@meith/moderation'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardFooter,
  CardRows,
  Empty,
  EmptyDescription,
  EmptyTitle,
  buttonVariants,
  cn,
} from '@meith/ui'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { PanelSectionGrid, PanelWaitingList } from '@/components/shell/panel-overview'
import { adminPageContext } from '@/server/admin'
import { pendingUpgradeNotice } from '@/server/upgrade-notice'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { hasReportScope, resolveReportScope } from '@/server/report-scope'
import { readTotals } from '@/server/stats'
import { ADMIN_SECTIONS } from '@/view/admin-nav'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { formatTime } from '@/view/time'

export default async function AdminHomePage() {
  const context = await adminPageContext()
  if (context === null) return null

  const actor = await getActor()
  const { adminLog, authorizer, moderationQueue, reports } = getContainer()

  const now = new Date()
  const { timezone } = await getViewerPreferences()

  const [recent, upgradeNotice, totals, pending, openReports] = await Promise.all([
    adminLog === null ? Promise.resolve([]) : adminLog.list({ limit: 6 }),
    pendingUpgradeNotice(),
    readTotals(),
    moderationQueue === null
      ? Promise.resolve(0)
      : authorizer
          .moderatedForumIds(actor)
          .then((forumIds) =>
            new ModerationQueue({ queue: moderationQueue }).countPending(forumIds),
          ),
    reports === null
      ? Promise.resolve(0)
      : resolveReportScope().then((scope) =>
          hasReportScope(scope) ? reports.countOpen(scope) : 0,
        ),
  ])

  const allClear = pending === 0 && openReports === 0 && upgradeNotice === null

  return (
    <PanelPage
      title="Overview"
      lede={
        <>
          Signed in to the control panel since{' '}
          <time dateTime={context.session.createdAt.toISOString()}>
            {formatTime(context.session.createdAt, now, timezone).label}
          </time>
          {context.session.ipPrefix === null ? null : ` from ${context.session.ipPrefix}`}
          .
        </>
      }
      gap="loose"
    >
      <PanelSection id="waiting-heading" title="Waiting for you">
        {upgradeNotice !== null && (
          <Alert tone="warning">
            <AlertDescription>
              <AlertTitle>Upgrade pending.</AlertTitle> {upgradeNotice}
            </AlertDescription>
            <a
              href="/admin/system"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'shrink-0',
              )}
            >
              System
            </a>
          </Alert>
        )}

        <PanelWaitingList
          items={[
            {
              count: pending,
              one: 'post held for approval',
              many: 'posts held for approval',
              href: '/moderation',
              action: 'Review',
            },
            {
              count: openReports,
              one: 'open report',
              many: 'open reports',
              href: '/moderation/reports',
              action: 'Open',
            },
          ]}
          emptyTitle="Nothing is waiting"
          emptyDescription={
            allClear
              ? 'No posts held for approval, no open reports, and the board is up to date.'
              : 'No posts held for approval and no open reports.'
          }
        />
      </PanelSection>

      {totals !== null && (
        <PanelSection id="totals-heading" title="The board">
          <Card>
            {totals.computedAt === null ? (
              <Empty className="py-8">
                <EmptyTitle>Not counted yet</EmptyTitle>
                <EmptyDescription>
                  The totals are rolled up by a scheduled task, and it has not run.
                </EmptyDescription>
              </Empty>
            ) : (
              <>
                <CardContent className="grid grid-cols-3 gap-4 p-5">
                  {[
                    { label: 'Threads', value: totals.threadCount },
                    { label: 'Posts', value: totals.postCount },
                    { label: 'Members', value: totals.memberCount },
                  ].map((figure) => (
                    <div key={figure.label}>
                      <p className="text-2xl font-semibold text-foreground tabular-nums">
                        {figure.value.toLocaleString('en')}
                      </p>
                      <p className="text-xs text-muted-foreground">{figure.label}</p>
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="justify-between">
                  <span>
                    {totals.newestUsername === null
                      ? 'No members yet'
                      : `Newest member: ${totals.newestUsername}`}
                  </span>
                  <span>
                    Counted{' '}
                    <time dateTime={totals.computedAt.toISOString()}>
                      {formatTime(totals.computedAt, now, timezone).label}
                    </time>
                  </span>
                </CardFooter>
              </>
            )}
          </Card>
        </PanelSection>
      )}

      <PanelSection id="activity-heading" title="Latest activity">
        <Card>
          {recent.length === 0 ? (
            <Empty className="py-8">
              <EmptyTitle>Nothing logged yet</EmptyTitle>
              <EmptyDescription>
                Administrative and moderation actions appear here as they happen.
              </EmptyDescription>
            </Empty>
          ) : (
            <>
              <CardRows>
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                  >
                    <code className="font-mono text-xs text-foreground">
                      {row.action}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {row.username ?? 'the system'}
                      {' · '}
                      <time dateTime={row.createdAt.toISOString()}>
                        {formatTime(row.createdAt, now, timezone).label}
                      </time>
                    </span>
                  </li>
                ))}
              </CardRows>
              <CardFooter>
                <a
                  href="/admin/log"
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  The whole log
                </a>
              </CardFooter>
            </>
          )}
        </Card>
      </PanelSection>

      <PanelSection id="sections-heading" title="Sections">
        <PanelSectionGrid sections={ADMIN_SECTIONS} />
      </PanelSection>
    </PanelPage>
  )
}
