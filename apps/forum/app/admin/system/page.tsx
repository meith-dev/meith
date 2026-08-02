import type { Metadata } from 'next'

import {
  ClearCacheForm,
  PruneSessionsForm,
  PruneTokensForm,
  RecountForm,
  RetryJobForm,
} from '@/components/admin/system-forms'
import { requireAdmin } from '@/server/admin'
import { buildSystemHealthView } from '@/server/system-admin'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'System health' }

/**
 * F70 — system health and maintenance.
 *
 * **The stale-tick warning is the point of this screen**, and it is loud on
 * purpose. Every catch-up operation this board has runs on the scheduled tick:
 * bans expire, digests send, counters reconcile, orphaned uploads are swept,
 * queued mail is delivered. When the tick stops, none of that *fails* — it
 * simply does not happen, and the board looks completely normal until somebody
 * notices that a member banned for a week is still banned a month later.
 *
 * A stopped scheduler is called out separately from an unhappy task, because
 * they are different problems with different fixes: one stale task is a bug in
 * that task, and every enabled task stale at once is a tick that is not firing.
 */
export default async function AdminSystemPage() {
  await requireAdmin()

  const now = new Date()
  const view = await buildSystemHealthView(now)

  if (view === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">System health</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it has no scheduler
          and nothing to maintain.
        </p>
      </div>
    )
  }

  const { scheduler, volumes } = view

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">System health</h1>
        <p className="text-sm text-muted-foreground">
          What the board does on a schedule, and whether it is doing it.
        </p>
      </div>

      {scheduler.schedulerStopped && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-serif text-lg font-semibold text-destructive">
            The scheduler is not running
          </h2>
          <p className="text-sm">
            Every task is overdue, which means the tick is not firing at all.
            While this is true: <strong>bans do not expire</strong>, digests and
            notification emails are not sent, counters drift, uploads that failed
            to process are not retried, and queued mail sits in the queue.
          </p>
          <p className="text-sm">
            Nothing is broken and nothing is lost — the tasks are written to
            catch up, so they will work through the backlog once it runs again.
            Check that whatever invokes the scheduled endpoint is still
            configured and still authorised.
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
              {scheduler.stale} task{scheduler.stale === 1 ? ' is' : 's are'} overdue
              by several of their own intervals.
            </p>
          )}
          {scheduler.failing > 0 && (
            <p>
              {scheduler.failing} task{scheduler.failing === 1 ? ' is' : 's are'} failing
              repeatedly — running, and losing. The log below says why.
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold">Scheduled tasks</h2>
        {scheduler.tasks.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No tasks are registered. A build registers a task only when it has a
            worker that can genuinely do the work, so an absent one means the
            feature behind it is not wired up on this deployment.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {scheduler.tasks.map((task) => (
              <li key={task.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{task.key}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    every {task.intervalSeconds}s ·{' '}
                    {task.lastRunAt === null
                      ? 'never run'
                      : `last ran ${formatTime(task.lastRunAt, now).label}`}
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
        <h2 className="font-serif text-lg font-semibold">Recent runs</h2>
        {view.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has run yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {view.runs.map((run, index) => (
              <li key={`${run.taskKey}:${run.ranAt.toISOString()}:${index}`}>
                <code className="text-xs">{run.taskKey}</code>{' '}
                <span className="text-muted-foreground">
                  {run.succeeded ? 'ok' : 'failed'}
                  {run.durationMs !== null && ` · ${run.durationMs}ms`} ·{' '}
                  <time dateTime={run.ranAt.toISOString()}>
                    {formatTime(run.ranAt, now).label}
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
        <h2 className="font-serif text-lg font-semibold">Volumes</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li>{volumes.users} members</li>
          <li>{volumes.threads} threads</li>
          <li>{volumes.posts} posts</li>
          <li>{volumes.attachments} attachments</li>
          <li>{volumes.queuedJobs} jobs waiting</li>
          <li
            className={volumes.deadLetteredJobs > 0 ? 'font-medium text-destructive' : undefined}
          >
            {volumes.deadLetteredJobs} dead-lettered
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold">Recount &amp; rebuild</h2>
        <p className="text-sm text-muted-foreground">
          Counters are denormalised, so they can drift. The recount walks the
          content and corrects them in bounded batches, keeping its phase and
          cursor in the database — so it resumes where it stopped rather than
          starting over, which is what makes it finish at all on a large board.
        </p>
        {view.recount.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {view.recount.map((row) => (
              <li key={row.id}>
                {row.id}: phase {row.phase}, cursor {row.cursor}, {row.passes} complete
                pass{row.passes === 1 ? '' : 'es'}, {row.corrected} corrected
              </li>
            ))}
          </ul>
        )}
        <RecountForm />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Maintenance</h2>
        <p className="text-sm text-muted-foreground">
          Each of these is bounded to one batch. Nothing here destroys anything
          an operator would want back: expired sessions no longer authenticate
          anybody, expired tokens can no longer be used, and a cleared cache is a
          copy of data that still exists.
        </p>

        <PruneSessionsForm prunable={view.prunableSessions} />
        <PruneTokensForm />
        <ClearCacheForm />
        <RetryJobForm />
      </section>
    </div>
  )
}
