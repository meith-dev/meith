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
import { requireAdmin } from '@/server/admin'
import { pendingUpgradeNotice } from '@/server/upgrade-notice'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { hasReportScope, resolveReportScope } from '@/server/report-scope'
import { readTotals } from '@/server/stats'
import { ADMIN_SECTIONS } from '@/view/admin-nav'
import { formatTime } from '@/view/time'

/**
 * F63 — the panel's index.
 *
 * ## It used to be a list of links
 *
 * Eleven bullets, each a section name and a sentence about it, above five lines
 * of admin log. That is a table of contents, and it answered no question an
 * administrator actually arrives with. Nobody opens the ACP to discover that a
 * "Forums" screen exists; they open it because something needs doing, or to
 * check that nothing does.
 *
 * So the page leads with **what is waiting**: posts held for approval, reports
 * nobody has closed, and an upgrade that has not been run. Each is a number, a
 * link straight to the queue it belongs to, and nothing else — and when all
 * three are clear it says so in one line rather than rendering three empty
 * panels. A dashboard that always has something amber on it is one people stop
 * reading.
 *
 * Below that is the board at a glance and the log. The sections are still
 * listed at the bottom — the shell's rail is terse by design, and this is
 * where each one gets a sentence saying what is inside it. Both read the same
 * tree, from `@/view/admin-nav`, so the panel cannot grow a screen that only
 * one of them knows about.
 *
 * ## The counts are the same counts those pages show
 *
 * `countPending` and `countOpen` are called with the scope resolved for *this*
 * actor, exactly as the moderation queue and the report list resolve it for
 * themselves. An administrator who reads "3 waiting" here and opens the queue
 * must not find four, and the only way to guarantee that is to ask the same
 * question through the same authorizer rather than to count rows.
 *
 * ## Everything degrades to absent
 *
 * A board in fixture mode has no moderation queue, no report store and no stats
 * rollup, and this page still renders: every read is `null`-guarded and the
 * panel it feeds is simply not shown. It is also the first screen an operator
 * sees after an install, when the rollup has genuinely never run — which is why
 * "not counted yet" is a state with words rather than three confident zeroes.
 */

export default async function AdminHomePage() {
  /* Re-run, because a layout is not a security boundary (see the layout). */
  const context = await requireAdmin()
  const actor = await getActor()
  const { adminLog, authorizer, moderationQueue, reports } = getContainer()

  const now = new Date()

  /*
   * Everything the page needs, concurrently rather than in five sequential
   * round trips: this is the screen an administrator opens first, and no read
   * here depends on another.
   */
  const [recent, upgradeNotice, totals, pending, openReports] = await Promise.all([
    adminLog === null ? Promise.resolve([]) : adminLog.list({ limit: 6 }),
    /* F84. `null` on a current board — a panel that always says "fine" stops being read. */
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
            {formatTime(context.session.createdAt, now).label}
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
                  {/*
                    The same caveat the public panel carries: these are a rollup,
                    and the number presented as "now" would be wrong.
                  */}
                  <span>
                    Counted{' '}
                    <time dateTime={totals.computedAt.toISOString()}>
                      {formatTime(totals.computedAt, now).label}
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
                        {formatTime(row.createdAt, now).label}
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
        {/*
          Only the sections that **exist** — a panel advertising links to pages
          that are not there would be worse than one that admits it is new
          (D32). Each screen is honest about its own limits rather than the
          index being honest on their behalf.
        */}
        <PanelSectionGrid sections={ADMIN_SECTIONS} />
      </PanelSection>
    </PanelPage>
  )
}
