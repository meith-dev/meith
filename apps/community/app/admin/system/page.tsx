import type { Metadata } from 'next'

import type { TaskHealthStatus } from '@meith/tasks'
import { cn } from '@meith/ui'

import {
  ClearCacheForm,
  PruneSessionsForm,
  PruneTokensForm,
  RecountForm,
  ReindexSearchForm,
  RetryJobForm,
} from '@/components/admin/system-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { buildSystemHealthView } from '@/server/system-admin'
import { systemFormsCopy } from '@/view/admin-panel-copy'
import { formatTime } from '@/view/time'

const TASK_STATUS_KEYS = {
  healthy: 'adminSystem.taskStatus.healthy',
  late: 'adminSystem.taskStatus.late',
  stale: 'adminSystem.taskStatus.stale',
  failing: 'adminSystem.taskStatus.failing',
  disabled: 'adminSystem.taskStatus.disabled',
  'never-run': 'adminSystem.taskStatus.never-run',
} satisfies Record<TaskHealthStatus, string>

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.system-health') }
}

export default async function AdminSystemPage() {
  if ((await adminPageContext()) === null) return null

  const now = new Date()
  const [translator, view] = await Promise.all([getTranslator(), buildSystemHealthView(now)])
  const copy = systemFormsCopy(translator)

  if (view === null) {
    return (
      <PanelPage title={await tr('page.system-health')}>
        <p className="mt-2 text-sm text-muted-foreground">{translator.t('adminSystem.sample')}</p>
      </PanelPage>
    )
  }

  const { mail, scheduler, volumes } = view

  return (
    <PanelPage
      title={await tr('page.system-health')}
      lede={await tr('page.what-board-does-schedule-whether')}
      gap="loose"
    >
      {scheduler.schedulerStopped && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            {await tr('page.scheduler-not-running')}
          </h2>
          <p className="text-sm">
            {translator.t('adminSystem.schedulerStoppedBefore')}{' '}
            <strong>{translator.t('adminSystem.schedulerStoppedStrong')}</strong>
            {translator.t('adminSystem.schedulerStoppedAfter')}
          </p>
          <p className="text-sm">{translator.t('adminSystem.schedulerStopped')}</p>
        </section>
      )}

      {!scheduler.schedulerStopped && (scheduler.stale > 0 || scheduler.failing > 0) && (
        <section
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          {scheduler.stale > 0 && (
            <p>{translator.t('adminSystem.tasksOverdue', { count: scheduler.stale })}</p>
          )}
          {scheduler.failing > 0 && (
            <p>{translator.t('adminSystem.tasksFailing', { count: scheduler.failing })}</p>
          )}
        </section>
      )}

      {mail.unactivatable && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            {await tr('page.no-new-member-can-activate')}
          </h2>
          <p className="text-sm">
            {translator.t('adminSystem.activationProblem', {
              method: mail.activationMethod,
              summary: mail.summary.toLowerCase(),
            })}
          </p>
          <p className="text-sm">
            {mail.source === 'environment' ? (
              <>
                {translator.t('adminSystem.environmentMailBefore')} <code>MAIL_*</code>{' '}
                {translator.t('adminSystem.environmentMailBetween')} <code>MAIL_DRIVER</code>{' '}
                {translator.t('adminSystem.environmentMailEnd')}
              </>
            ) : (
              <>
                {translator.t('adminSystem.boardMailBefore')}{' '}
                <a href="/admin/settings?group=mail" className="underline">
                  {translator.t('page.board-settings')}
                </a>{' '}
                {translator.t('adminSystem.boardMailAfter')} <strong>none</strong>{' '}
                {translator.t('adminSystem.boardMailOr')} <strong>admin</strong>.
              </>
            )}{' '}
            {translator.t('adminSystem.activationAccounts')}
          </p>
        </section>
      )}

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminSystem.mail')}</h2>
        <p className="text-sm">
          {mail.summary}
          {!mail.sends && (
            <span className="text-muted-foreground">
              {' '}
              {translator.t('adminSystem.mailDoesNotSend')}
            </span>
          )}{' '}
          {translator.t('adminSystem.activationMethod')} <code>{mail.activationMethod}</code>{' '}
          {translator.t('adminSystem.configuredFrom')}{' '}
          <code>
            {mail.source === 'environment'
              ? translator.t('adminSystem.environment')
              : translator.t('adminSystem.boardSettings')}
          </code>
        </p>
        {mail.source === 'board' && (
          <p className="text-sm text-muted-foreground">
            {translator.t('adminSystem.changeMailBefore')}{' '}
            <a href="/admin/settings?group=mail" className="underline">
              {translator.t('page.board-settings')}
            </a>
            {translator.t('adminSystem.changeMailEnd')}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{translator.t('adminSystem.mailSchedule')}</p>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.scheduled-tasks')}</h2>
        {scheduler.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translator.t('adminSystem.noTasks')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {scheduler.tasks.map((task) => (
              <li
                key={task.key}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {task.titleKey === undefined ? task.key : translator.t(task.titleKey)}
                  </span>
                  {task.descriptionKey !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {translator.t(task.descriptionKey)}
                    </span>
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    <code>{task.key}</code> ·{' '}
                    {translator.t('adminSystem.taskInterval', { seconds: task.intervalSeconds })} ·{' '}
                    {task.lastRunAt === null
                      ? translator.t('adminSystem.neverRun')
                      : translator.t('adminSystem.taskLastRun', {
                          time: formatTime(task.lastRunAt, now, translator).label,
                        })}
                    {task.consecutiveFailures > 0 &&
                      ` · ${translator.t('adminSystem.taskFailures', {
                        count: task.consecutiveFailures,
                      })}`}
                  </span>
                </span>
                <span
                  className={
                    task.status === 'healthy' || task.status === 'disabled'
                      ? 'shrink-0 text-xs text-muted-foreground'
                      : 'shrink-0 text-xs font-medium text-destructive'
                  }
                >
                  {translator.t(TASK_STATUS_KEYS[task.status])}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.recent-runs')}</h2>
        {view.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{await tr('page.nothing-has-run-yet')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {view.runs.map((run, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the tiebreaker between two runs of one task recorded at the same instant
              <li key={`${run.taskKey}:${run.ranAt.toISOString()}:${index}`}>
                <code className="text-xs">{run.taskKey}</code>{' '}
                <span className="text-muted-foreground">
                  {run.succeeded
                    ? translator.t('adminSystem.taskRunOk')
                    : translator.t('adminSystem.taskRunFailed')}
                  {run.durationMs !== null && ` · ${run.durationMs}ms`} ·{' '}
                  <time dateTime={run.ranAt.toISOString()}>
                    {formatTime(run.ranAt, now, translator).label}
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

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminSystem.volumes')}
        </h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li>{translator.t('adminSystem.members', { count: volumes.users })}</li>
          <li>{translator.t('adminSystem.threads', { count: volumes.threads })}</li>
          <li>{translator.t('adminSystem.posts', { count: volumes.posts })}</li>
          <li>{translator.t('adminSystem.attachments', { count: volumes.attachments })}</li>
          <li>{translator.t('adminSystem.queuedJobs', { count: volumes.queuedJobs })}</li>
          <li className={volumes.deadLetteredJobs > 0 ? 'font-medium text-destructive' : undefined}>
            {translator.t('adminSystem.deadLettered', { count: volumes.deadLetteredJobs })}
          </li>
        </ul>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminSystem.recount')}
        </h2>
        <p className="text-sm text-muted-foreground">{translator.t('adminSystem.recountHint')}</p>
        {view.recount.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {view.recount.map((row) => (
              <li key={row.id}>
                {translator.t('adminSystem.recountProgress', {
                  id: row.id,
                  phase: row.phase,
                  cursor: row.cursor,
                  passes: row.passes,
                  corrected: row.corrected,
                })}
              </li>
            ))}
          </ul>
        )}
        <RecountForm copy={copy} />
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.search-index')}</h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('adminSystem.searchIndexHint')}
        </p>
        <p className="text-sm">
          {translator.t('adminSystem.searchIndexIndexed', { count: view.searchIndex.indexed })}
          {view.searchIndex.pending > 0 && (
            <span className="font-medium text-destructive">
              {' · '}
              {translator.t('adminSystem.searchIndexPending', { count: view.searchIndex.pending })}
            </span>
          )}
          .
        </p>
        <ReindexSearchForm pending={view.searchIndex.pending} copy={copy} />
      </section>

      <section className={cn(PANEL_CARD, 'gap-4')}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminSystem.maintenance')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('adminSystem.maintenanceHint')}
        </p>

        <PruneSessionsForm prunable={view.prunableSessions} copy={copy} />
        <PruneTokensForm copy={copy} />
        <ClearCacheForm copy={copy} />
        <RetryJobForm copy={copy} />
      </section>
    </PanelPage>
  )
}
