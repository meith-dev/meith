import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import {
  ClearCacheForm,
  PruneSessionsForm,
  PruneTokensForm,
  RecountForm,
  ReindexSearchForm,
  RetryJobForm,
} from '@/components/admin/system-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE, PANEL_ROW } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { buildSystemHealthView } from '@/server/system-admin'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'System health' }

export default async function AdminSystemPage() {
  if ((await adminPageContext()) === null) return null

  const now = new Date()
  const { timezone } = await getViewerPreferences()
  const view = await buildSystemHealthView(now)

  if (view === null) {
    return (
      <PanelPage title="System health">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it has no scheduler and nothing to
          maintain.
        </p>
      </PanelPage>
    )
  }

  const { mail, scheduler, volumes } = view

  return (
    <PanelPage
      title="System health"
      lede={<>What the board does on a schedule, and whether it is doing it.</>}
      gap="loose"
    >
      {scheduler.schedulerStopped && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            The scheduler is not running
          </h2>
          <p className="text-sm">
            Every task is overdue, which means the tick is not firing at all. While this is true:{' '}
            <strong>bans do not expire</strong>, digests and notification emails are not sent,
            counters drift, uploads that failed to process are not retried, and queued mail sits in
            the queue.
          </p>
          <p className="text-sm">
            Nothing is broken and nothing is lost — the tasks are written to catch up, so they will
            work through the backlog once it runs again. Check that whatever invokes the scheduled
            endpoint is still configured and still authorised.
          </p>
        </section>
      )}

      {!scheduler.schedulerStopped && (scheduler.stale > 0 || scheduler.failing > 0) && (
        <section
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          {scheduler.stale > 0 && (
            <p>
              {scheduler.stale} task{scheduler.stale === 1 ? ' is' : 's are'} overdue by several of
              their own intervals.
            </p>
          )}
          {scheduler.failing > 0 && (
            <p>
              {scheduler.failing} task
              {scheduler.failing === 1 ? ' is' : 's are'} failing repeatedly — running, and losing.
              The log below says why.
            </p>
          )}
        </section>
      )}

      {mail.unactivatable && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            No new member can activate their account
          </h2>
          <p className="text-sm">
            Registration is set to <strong>{mail.activationMethod}</strong>, so every new account
            waits for a confirmation link — and this board sends no mail:{' '}
            {mail.summary.toLowerCase()}. Password reset is silently failing for the same reason.
          </p>
          <p className="text-sm">
            {mail.source === 'environment' ? (
              <>
                Mail is configured from this deployment’s environment, so it has to be fixed there:
                complete the <code>MAIL_*</code> variables and redeploy, or unset{' '}
                <code>MAIL_DRIVER</code> to configure mail on the board instead.
              </>
            ) : (
              <>
                Set it up on the{' '}
                <a href="/admin/settings?group=mail" className="underline">
                  mail settings screen
                </a>{' '}
                — no redeploy needed — or set the activation method to <strong>none</strong> or{' '}
                <strong>admin</strong>.
              </>
            )}{' '}
            Accounts already stuck at &ldquo;awaiting activation&rdquo; can be activated by hand
            from the member screen.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Mail</h2>
        <p className="text-sm">
          {mail.summary}
          {!mail.sends && (
            <span className="text-muted-foreground">
              {' '}
              — nothing this board sends reaches anybody.
            </span>
          )}{' '}
          · activation method: <code>{mail.activationMethod}</code> · configured from{' '}
          <code>{mail.source === 'environment' ? 'the environment' : 'board settings'}</code>
        </p>
        {mail.source === 'board' && (
          <p className="text-sm text-muted-foreground">
            Change it — and send a test message to prove it works — on the{' '}
            <a href="/admin/settings?group=mail" className="underline">
              mail settings screen
            </a>
            .
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Notification and mass mail leave on the tick above, so a stopped scheduler is also a board
          that sends none of them. Verification and password-reset links are sent as the request
          happens and do not wait for it.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Scheduled tasks</h2>
        {scheduler.tasks.length === 0 ? (
          <p className={PANEL_NOTE}>
            No tasks are registered. A build registers a task only when it has a worker that can
            genuinely do the work, so an absent one means the feature behind it is not wired up on
            this deployment.
          </p>
        ) : (
          <ul className={PANEL_LIST}>
            {scheduler.tasks.map((task) => (
              <li key={task.key} className={PANEL_ROW}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{task.key}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    every {task.intervalSeconds}s ·{' '}
                    {task.lastRunAt === null
                      ? 'never run'
                      : `last ran ${formatTime(task.lastRunAt, now, timezone).label}`}
                    {task.consecutiveFailures > 0 &&
                      ` · ${task.consecutiveFailures} failure${
                        task.consecutiveFailures === 1 ? '' : 's'
                      } in a row`}
                  </span>
                </span>
                <span
                  className={
                    task.status === 'healthy' || task.status === 'disabled'
                      ? 'shrink-0 text-xs text-muted-foreground'
                      : 'shrink-0 text-xs font-medium text-destructive'
                  }
                >
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Recent runs</h2>
        {view.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has run yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {view.runs.map((run, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the tiebreaker between two runs of one task recorded at the same instant
              <li key={`${run.taskKey}:${run.ranAt.toISOString()}:${index}`}>
                <code className="text-xs">{run.taskKey}</code>{' '}
                <span className="text-muted-foreground">
                  {run.succeeded ? 'ok' : 'failed'}
                  {run.durationMs !== null && ` · ${run.durationMs}ms`} ·{' '}
                  <time dateTime={run.ranAt.toISOString()}>
                    {formatTime(run.ranAt, now, timezone).label}
                  </time>
                  {run.detail !== null && ` · ${run.detail}`}
                </span>
                {run.error !== null && (
                  <span className="block text-xs text-destructive">{run.error}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Volumes</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li>{volumes.users} members</li>
          <li>{volumes.threads} threads</li>
          <li>{volumes.posts} posts</li>
          <li>{volumes.attachments} attachments</li>
          <li>{volumes.queuedJobs} jobs waiting</li>
          <li className={volumes.deadLetteredJobs > 0 ? 'font-medium text-destructive' : undefined}>
            {volumes.deadLetteredJobs} dead-lettered
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Recount &amp; rebuild</h2>
        <p className="text-sm text-muted-foreground">
          Counters are denormalised, so they can drift. The recount walks the content and corrects
          them in bounded batches, keeping its phase and cursor in the database — so it resumes
          where it stopped rather than starting over, which is what makes it finish at all on a
          large board.
        </p>
        {view.recount.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {view.recount.map((row) => (
              <li key={row.id}>
                {row.id}: phase {row.phase}, cursor {row.cursor}, {row.passes} complete pass
                {row.passes === 1 ? '' : 'es'}, {row.corrected} corrected
              </li>
            ))}
          </ul>
        )}
        <RecountForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Search index</h2>
        <p className="text-sm text-muted-foreground">
          A post is indexed when it is written or edited, so this is only ever a backfill — an
          existing board adopting search, or one whose index was invalidated. It resumes by
          construction: the batch is &ldquo;posts with no index entry&rdquo;, a set that only
          shrinks, so an interrupted run costs nothing and a repeated one does nothing.
        </p>
        <p className="text-sm">
          {view.searchIndex.indexed} indexed
          {view.searchIndex.pending > 0 && (
            <span className="font-medium text-destructive">
              {' '}
              · {view.searchIndex.pending} not yet searchable
            </span>
          )}
          .
        </p>
        <ReindexSearchForm pending={view.searchIndex.pending} />
      </section>

      <section className={cn(PANEL_CARD, 'gap-4')}>
        <h2 className="font-heading text-lg font-semibold">Maintenance</h2>
        <p className="text-sm text-muted-foreground">
          Each of these is bounded to one batch. Nothing here destroys anything an operator would
          want back: expired sessions no longer authenticate anybody, expired tokens can no longer
          be used, and a cleared cache is a copy of data that still exists.
        </p>

        <PruneSessionsForm prunable={view.prunableSessions} />
        <PruneTokensForm />
        <ClearCacheForm />
        <RetryJobForm />
      </section>
    </PanelPage>
  )
}
