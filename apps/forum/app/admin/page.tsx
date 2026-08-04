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
import { formatTime } from '@/view/time'

/**
 * F63 — the panel's index.
 *
 * ## It used to be a list of links
 *
 * Eleven bullets, each a section name and a sentence about it, above five lines
 * of admin log. That is a table of contents, and the navigation on the left is
 * already one — so the landing page of the control panel answered no question an
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
 * listed, because the ACP is used by people who visit it twice a year and the
 * sidebar's labels are terse — but they are a grid at the bottom, not the page.
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

interface SectionLink {
  readonly href: string
  readonly title: string
  readonly blurb: string
}

const SECTIONS: readonly SectionLink[] = [
  {
    href: '/admin/settings',
    title: 'Board settings',
    blurb: 'Every setting this build has, grouped and searchable.',
  },
  {
    href: '/admin/forums',
    title: 'Forums',
    blurb: 'The tree, each forum’s options, and the permission matrix.',
  },
  {
    href: '/admin/groups',
    title: 'Groups',
    blurb: 'What each group allows, promotions, and mass membership changes.',
  },
  {
    href: '/admin/users',
    title: 'Users',
    blurb: 'Find an account, change it, merge or prune, or mail the board.',
  },
  {
    href: '/admin/content',
    title: 'Content',
    blurb: 'Announcements, attachments, and the housekeeping around them.',
  },
  {
    href: '/admin/antispam',
    title: 'Anti-spam',
    blurb: 'The honeypot, the question, the limits, and first-post moderation.',
  },
  {
    href: '/admin/themes',
    title: 'Themes',
    blurb: 'Installed themes, their tokens, and this board’s overrides.',
  },
  {
    href: '/admin/plugins',
    title: 'Plugins',
    blurb: 'What is installed, what it may do, and what has been failing.',
  },
  {
    href: '/admin/api-tokens',
    title: 'API tokens',
    blurb: 'Issue and revoke tokens, and see what each one may reach.',
  },
  {
    href: '/admin/system',
    title: 'System',
    blurb: 'Scheduled tasks, the search index, caches, and the build.',
  },
  {
    href: '/admin/log',
    title: 'Admin log',
    blurb: 'Every administrative and moderation action, with who and from where.',
  },
]

/** One number that is also a call to action. */
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
        {/*
          Only the sections that **exist** — a panel advertising links to pages
          that are not there would be worse than one that admits it is new
          (D32). Each screen is honest about its own limits rather than the
          index being honest on their behalf.
        */}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Card className="relative h-full transition-colors hover:bg-muted/50">
                <CardContent className="flex flex-col gap-0.5 p-4">
                  <a
                    href={section.href}
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {/*
                      The whole card is the target, through an overlay on the
                      link rather than an `<a>` wrapping both lines — so the
                      link's accessible name stays the section's title instead
                      of the title read together with its description.
                    */}
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
