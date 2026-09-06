import type { Metadata } from 'next'

import type { TaskHealthStatus } from '@meith/tasks'

import {
  ApplyMigrationsForm,
  ClearCacheForm,
  PruneSessionsForm,
  PruneTokensForm,
  RecountForm,
  ReindexSearchForm,
  RetryJobForm,
} from '@/components/admin/system-forms'
import { SystemRunDetails } from '@/components/admin/system-run-details'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { buildSystemHealthView } from '@/server/system-admin'
import { CODE_VERSION, pendingUpgradeNotice } from '@/server/upgrade-notice'
import { systemFormsCopy } from '@/view/admin-panel-copy'
import { formatTime } from '@/view/time'

const TASK_STATUS_KEYS = {
  healthy: 'adminSystem.taskStatus.healthy',
  running: 'adminSystem.taskStatus.running',
  late: 'adminSystem.taskStatus.late',
  stale: 'adminSystem.taskStatus.stale',
  failing: 'adminSystem.taskStatus.failing',
  disabled: 'adminSystem.taskStatus.disabled',
  'never-run': 'adminSystem.taskStatus.never-run',
} satisfies Record<TaskHealthStatus, string>

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.system-health') }
}

export default async function AdminSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ maintenance?: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const maintenanceOpen = (await searchParams).maintenance === '1'
  const now = new Date()
  const [translator, view, upgradeNotice] = await Promise.all([
    getTranslator(),
    buildSystemHealthView(now),
    pendingUpgradeNotice(),
  ])
  const copy = systemFormsCopy(translator)

  if (view === null) {
    return (
      <PanelPage title={await tr('page.system-health')}>
        <p className="mt-2 text-sm text-muted-foreground">{translator.t('adminSystem.sample')}</p>
      </PanelPage>
    )
  }

  const { mail, scheduler, volumes, legacyPasswordHashes } = view
  const taskTitles = new Map(scheduler.tasks.map((task) => [task.key, task.titleKey]))
  const taskCounts = Object.entries(TASK_STATUS_KEYS).map(([status, key]) => ({
    status,
    label: translator.t(key),
    count: scheduler.tasks.filter((task) => task.status === status).length,
  }))

  return (
    <PanelPage
      title={await tr('page.system-health')}
      lede={await tr('page.what-board-does-schedule-whether')}
      width="wide"
      gap="normal"
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

      <div className="grid items-start gap-4 xl:grid-cols-2">
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
          <p className="text-sm text-muted-foreground">
            {translator.t('adminSystem.mailSchedule')}
          </p>
        </section>

        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {translator.t('adminSystem.migrations')}
          </h2>
          <p className="text-sm">
            {translator.t('adminSystem.runningVersion')} <code>{CODE_VERSION}</code>.
          </p>
          {upgradeNotice === null ? (
            <p className="text-sm text-muted-foreground">
              {translator.t('adminSystem.migrationsUpToDate')}
            </p>
          ) : (
            <>
              <p className="text-sm text-destructive">{upgradeNotice}</p>
              <p className="text-sm text-muted-foreground">
                {translator.t('adminSystem.migrationsHint')}
              </p>
              <ApplyMigrationsForm copy={copy} />
            </>
          )}
        </section>
      </div>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.scheduled-tasks')}</h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('adminSystem.taskCount', { count: scheduler.tasks.length })}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {taskCounts
            .filter(({ count }) => count > 0)
            .map(({ status, label, count }) => (
              <li
                key={status}
                className={
                  status === 'stale' || status === 'failing'
                    ? 'font-medium text-destructive'
                    : 'text-muted-foreground'
                }
              >
                {translator.t('adminSystem.tasksInState', { count, status: label })}
              </li>
            ))}
        </ul>
        <details open={scheduler.stale > 0 || scheduler.failing > 0}>
          <summary className="cursor-pointer text-sm font-medium">
            {translator.t('adminSystem.showTasks')}
          </summary>
          {scheduler.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{translator.t('adminSystem.noTasks')}</p>
          ) : (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {scheduler.tasks.map((task) => (
                <li
                  key={task.key}
                  className="flex min-w-0 items-start justify-between gap-3 border-t border-border py-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium [overflow-wrap:anywhere]">
                      {task.titleKey === undefined ? task.key : translator.t(task.titleKey)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {translator.t('adminSystem.taskInterval', { seconds: task.intervalSeconds })}{' '}
                      ·{' '}
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
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        {translator.t('adminSystem.taskDetails')}
                      </summary>
                      <div className="mt-2 flex flex-col gap-1 [overflow-wrap:anywhere]">
                        <code>{task.key}</code>
                        {task.descriptionKey !== undefined && (
                          <p>{translator.t(task.descriptionKey)}</p>
                        )}
                      </div>
                    </details>
                  </div>
                  <span
                    className={
                      task.status === 'healthy' ||
                      task.status === 'running' ||
                      task.status === 'disabled'
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
        </details>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.recent-runs')}</h2>
        <details open={view.runs.some((run) => !run.succeeded)}>
          <summary className="cursor-pointer text-sm font-medium">
            {translator.t('adminSystem.showRuns')}
            <span className="ml-2 font-normal text-muted-foreground">
              {translator.t('adminSystem.runCount', { count: view.runs.length })}
            </span>
          </summary>
          {view.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{await tr('page.nothing-has-run-yet')}</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
              {view.runs.map((run, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: the tiebreaker between two runs of one task recorded at the same instant
                  key={`${run.taskKey}:${run.ranAt.toISOString()}:${index}`}
                  className="min-w-0 py-3 [overflow-wrap:anywhere]"
                >
                  <span className="font-medium">
                    {taskTitles.get(run.taskKey) === undefined
                      ? run.taskKey
                      : translator.t(taskTitles.get(run.taskKey)!)}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    {run.succeeded
                      ? translator.t('adminSystem.taskRunOk')
                      : translator.t('adminSystem.taskRunFailed')}
                    {run.durationMs !== null && ` · ${run.durationMs}ms`} ·{' '}
                    <time dateTime={run.ranAt.toISOString()}>
                      {formatTime(run.ranAt, now, translator).label}
                    </time>
                  </span>
                  <SystemRunDetails detail={run.detail} translator={translator} />
                  {run.error !== null && (
                    <span className="block text-xs text-destructive">{run.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>

      {legacyPasswordHashes > 0 && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {translator.t('adminSystem.legacyPasswords')}
          </h2>
          <p className="text-sm">
            {translator.t('adminSystem.legacyPasswordsCount', { count: legacyPasswordHashes })}
          </p>
          <p className="text-sm text-muted-foreground">
            {translator.t('adminSystem.legacyPasswordsHint')}
          </p>
        </section>
      )}

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

      <section id="maintenance" className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminSystem.maintenance')}
        </h2>
        <a
          href={
            maintenanceOpen
              ? '/admin/system#maintenance'
              : '/admin/system?maintenance=1#maintenance'
          }
          className="w-fit text-sm font-medium underline underline-offset-4"
        >
          {translator.t(
            maintenanceOpen ? 'adminSystem.closeMaintenance' : 'adminSystem.openMaintenance',
          )}
        </a>
        {maintenanceOpen && (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h3 className="font-heading font-semibold">{translator.t('adminSystem.recount')}</h3>
              <p className="text-sm text-muted-foreground">
                {translator.t('adminSystem.recountHint')}
              </p>
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

            <p className="text-sm text-muted-foreground">
              {translator.t('adminSystem.maintenanceHint')}
            </p>

            <PruneSessionsForm prunable={view.prunableSessions} copy={copy} />
            <PruneTokensForm copy={copy} />
            <ClearCacheForm copy={copy} />
            <RetryJobForm copy={copy} />
          </div>
        )}
      </section>
    </PanelPage>
  )
}
