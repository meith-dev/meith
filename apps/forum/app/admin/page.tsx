import { ModerationQueue } from '@meith/moderation'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardFooter,
  Empty,
  EmptyDescription,
  EmptyTitle,
  buttonVariants,
  cn,
} from '@meith/ui'

import { requireAdmin } from '@/server/admin'
import { pendingUpgradeNotice } from '@/server/upgrade-notice'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { hasReportScope, resolveReportScope } from '@/server/report-scope'
import { readTotals } from '@/server/stats'
import { ADMIN_SECTIONS } from '@/view/admin-nav'
import { formatTime } from '@/view/time'

function Waiting({
  count,
  one,
  many,
  href,
  action,
}: {
  count: number
  one: string
  many: string
  href: string
  action: string
}) {
  return (
    <Card className="flex-1 border-moderation-pending/50">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-2xl font-semibold text-foreground tabular-nums">{count}</p>
          <p className="text-sm text-muted-foreground">{count === 1 ? one : many}</p>
        </div>
        <a href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {action}
        </a>
      </CardContent>
    </Card>
  )
}

export default async function AdminHomePage() {
  const context = await requireAdmin()
  const actor = await getActor()
  const { adminLog, authorizer, moderationQueue, reports } = getContainer()

  const now = new Date()

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
      <section className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Signed in to the control panel since{' '}
          <time dateTime={context.session.createdAt.toISOString()}>
            {formatTime(context.session.createdAt, now).label}
          </time>
          {context.session.ipPrefix === null ? null : ` from ${context.session.ipPrefix}`}.
        </p>
      </section>

      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="font-serif text-lg font-semibold">
          Waiting for you
        </h2>

        {upgradeNotice !== null && (
          <Alert tone="warning">
            <AlertDescription>
              <AlertTitle>Upgrade pending.</AlertTitle> {upgradeNotice}
            </AlertDescription>
            <a
              href="/admin/system"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
            >
              System
            </a>
          </Alert>
        )}

        {pending === 0 && openReports === 0 ? (
          <Card>
            <Empty className="py-8">
              <EmptyTitle>Nothing is waiting</EmptyTitle>
              <EmptyDescription>
                {allClear
                  ? 'No posts held for approval, no open reports, and the board is up to date.'
                  : 'No posts held for approval and no open reports.'}
              </EmptyDescription>
            </Empty>
          </Card>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            {pending > 0 && (
              <Waiting
                count={pending}
                one="post held for approval"
                many="posts held for approval"
                href="/moderation"
                action="Review"
              />
            )}
            {openReports > 0 && (
              <Waiting
                count={openReports}
                one="open report"
                many="open reports"
                href="/moderation/reports"
                action="Open"
              />
            )}
          </div>
        )}
      </section>

      {totals !== null && (
        <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
          <h2 id="totals-heading" className="font-serif text-lg font-semibold">
            The board
          </h2>

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
                  { }
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
        </section>
      )}

      <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
        <h2 id="activity-heading" className="font-serif text-lg font-semibold">
          Latest activity
        </h2>

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
              <ul className="divide-y divide-border">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                  >
                    <code className="font-mono text-xs text-foreground">{row.action}</code>
                    <span className="text-xs text-muted-foreground">
                      {row.username ?? 'the system'}
                      {' · '}
                      <time dateTime={row.createdAt.toISOString()}>
                        {formatTime(row.createdAt, now).label}
                      </time>
                    </span>
                  </li>
                ))}
              </ul>
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
      </section>

      <section aria-labelledby="sections-heading" className="flex flex-col gap-3">
        <h2 id="sections-heading" className="font-serif text-lg font-semibold">
          Sections
        </h2>
        { }
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_SECTIONS.map((section) => (
            <li key={section.href}>
              <Card className="relative h-full transition-colors hover:bg-muted/50">
                <CardContent className="flex flex-col gap-0.5 p-4">
                  <a
                    href={section.href}
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    { }
                    <span className="absolute inset-0" />
                    {section.title}
                  </a>
                  <p className="text-xs text-muted-foreground">{section.blurb}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
