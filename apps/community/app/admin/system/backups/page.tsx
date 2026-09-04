import type { Metadata } from 'next'

import type { BackupRunRecord } from '@meith/backup'
import { formatScheduleTime } from '@meith/backup'
import { cn } from '@meith/ui'

import {
  DeleteBackupForm,
  RequestBackupForm,
  TestDestinationForm,
} from '@/components/admin/backup-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { buildBackupAdminView } from '@/server/backup-admin'
import { getTranslator, tr } from '@/server/i18n'
import { backupFormsCopy } from '@/view/admin-panel-copy'
import { settingsHref } from '@/view/admin-settings'
import { formatBytes } from '@/view/attachments'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.backups') }
}

const RUN_STATUS_KEYS = {
  queued: 'adminBackups.run.queued',
  running: 'adminBackups.run.running',
  done: 'adminBackups.run.done',
  incomplete: 'adminBackups.run.incomplete',
  failed: 'adminBackups.run.failed',
} as const satisfies Record<BackupRunRecord['status'], string>

const RUN_TRIGGER_KEYS = {
  manual: 'adminBackups.trigger.manual',
  schedule: 'adminBackups.trigger.schedule',
  upgrade: 'adminBackups.trigger.upgrade',
  cli: 'adminBackups.trigger.cli',
} as const satisfies Record<BackupRunRecord['trigger'], string>

const WEEKDAY_KEYS: Readonly<Record<number, string>> = {
  0: 'setting.backup.weekday.option.0',
  1: 'setting.backup.weekday.option.1',
  2: 'setting.backup.weekday.option.2',
  3: 'setting.backup.weekday.option.3',
  4: 'setting.backup.weekday.option.4',
  5: 'setting.backup.weekday.option.5',
  6: 'setting.backup.weekday.option.6',
}

const DOWNLOAD_LINK =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function AdminBackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const now = new Date()
  const [translator, view, query] = await Promise.all([
    getTranslator(),
    buildBackupAdminView(now),
    searchParams,
  ])
  const copy = backupFormsCopy(translator)
  const t = translator.t.bind(translator)

  if (view === null) {
    return (
      <PanelPage
        title={await tr('page.backups')}
        back={{ href: '/admin/system', label: t('adminBackups.backToSystem') }}
      >
        <p className="mt-2 text-sm text-muted-foreground">{t('adminBackups.sample')}</p>
      </PanelPage>
    )
  }

  const { settings } = view
  const available = view.capability === 'available'
  const time = formatScheduleTime(settings.schedule)
  const scheduleSummary =
    settings.schedule.frequency === 'off'
      ? t('adminBackups.schedule.off')
      : settings.schedule.frequency === 'daily'
        ? t('adminBackups.schedule.daily', { time })
        : t('adminBackups.schedule.weekly', {
            time,
            weekday: t(WEEKDAY_KEYS[settings.schedule.weekday] ?? WEEKDAY_KEYS[1] ?? ''),
          })
  const retentionSummary =
    (settings.retention.keepDays ?? 0) > 0
      ? t('adminBackups.retention.countAndDays', {
          count: settings.retention.keep,
          days: settings.retention.keepDays ?? 0,
        })
      : t('adminBackups.retention.count', { count: settings.retention.keep })

  return (
    <PanelPage
      title={await tr('page.backups')}
      back={{ href: '/admin/system', label: t('adminBackups.backToSystem') }}
      lede={t('adminBackups.lede')}
      gap="loose"
    >
      {query.notice === 'reauth' && (
        <section role="alert" className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          {t('adminBackups.reauth')}
        </section>
      )}

      {view.capability === 'serverless' && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p>{t('adminBackups.serverless')}</p>
        </section>
      )}

      <section className={cn(PANEL_CARD, 'gap-4')}>
        <h2 className="font-heading text-lg font-semibold">{t('adminBackups.now.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminBackups.now.hint')}</p>
        {view.active !== null && (
          <p className="text-sm">
            {view.active.status === 'running'
              ? t('adminBackups.now.running', {
                  since: formatTime(
                    view.active.startedAt ?? view.active.requestedAt,
                    now,
                    translator,
                  ).label,
                })
              : t('adminBackups.now.queued')}
          </p>
        )}
        <RequestBackupForm disabled={!available || view.active !== null} copy={copy} />
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t('adminBackups.plan.title')}</h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <span className="text-muted-foreground">{t('adminBackups.plan.schedule')}</span>{' '}
            {scheduleSummary}
            {view.nextScheduled !== null && available && (
              <span className="text-muted-foreground">
                {' · '}
                {t('adminBackups.plan.next', {
                  time: formatTime(view.nextScheduled, now, translator).label,
                })}
              </span>
            )}
          </li>
          <li>
            <span className="text-muted-foreground">{t('adminBackups.plan.retention')}</span>{' '}
            {retentionSummary}
          </li>
          <li>
            <span className="text-muted-foreground">{t('adminBackups.plan.uploads')}</span>{' '}
            {settings.uploads === 'include'
              ? t('adminBackups.plan.uploadsIncluded')
              : t('adminBackups.plan.uploadsSkipped')}
          </li>
          <li>
            <span className="text-muted-foreground">{t('adminBackups.plan.beforeUpgrade')}</span>{' '}
            {settings.beforeUpgrade ? t('adminBackups.plan.on') : t('adminBackups.plan.off')}
          </li>
          <li>
            <span className="text-muted-foreground">{t('adminBackups.plan.ring')}</span>{' '}
            <code className="text-xs">{view.ring}</code>
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          <a href={settingsHref({ group: 'backup' })} className="underline">
            {t('adminBackups.plan.change')}
          </a>
        </p>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {t('adminBackups.destination.title')}
        </h2>
        {view.destination.source === 'none' ? (
          <p className="text-sm text-muted-foreground">{t('adminBackups.destination.none')}</p>
        ) : (
          <p className="text-sm">
            {view.destination.description === null
              ? t('adminBackups.destination.unusable')
              : t('adminBackups.destination.shipsTo', {
                  destination: view.destination.description,
                })}{' '}
            <span className="text-muted-foreground">
              {view.destination.source === 'environment'
                ? t('adminBackups.destination.fromEnvironment')
                : t('adminBackups.destination.fromBoard')}
            </span>
          </p>
        )}
        {view.destination.problem !== null && (
          <p className="text-sm text-destructive">{view.destination.problem}</p>
        )}
        {view.destination.listError !== null && (
          <p className="text-sm text-destructive">
            {t('adminBackups.destination.listFailed', { error: view.destination.listError })}
          </p>
        )}
        {view.destination.description !== null && <TestDestinationForm copy={copy} />}
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t('adminBackups.bundles.title')}</h2>
        {view.bundles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminBackups.bundles.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.bundles.map((bundle) => (
              <li
                key={bundle.name}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {bundle.takenAt === null
                      ? bundle.name
                      : formatTime(bundle.takenAt, now, translator).label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    <code>{bundle.name}</code>
                    {bundle.localSize !== null &&
                      ` · ${t('adminBackups.bundles.local', { size: formatBytes(bundle.localSize) })}`}
                    {bundle.remoteSize !== null &&
                      ` · ${t('adminBackups.bundles.offSite', { size: formatBytes(bundle.remoteSize) })}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  <a
                    href={`/admin/system/backups/${encodeURIComponent(bundle.name)}`}
                    className={DOWNLOAD_LINK}
                  >
                    {t('adminBackups.bundles.download')}
                  </a>
                  <DeleteBackupForm name={bundle.name} copy={copy} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('adminBackups.bundles.restoreHint')}</p>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t('adminBackups.runs.title')}</h2>
        {view.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminBackups.runs.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {view.runs.map((run) => (
              <li key={run.id}>
                <span
                  className={
                    run.status === 'failed' || run.status === 'incomplete'
                      ? 'font-medium text-destructive'
                      : 'font-medium'
                  }
                >
                  {t(RUN_STATUS_KEYS[run.status])}
                </span>{' '}
                <span className="text-muted-foreground">
                  {t(RUN_TRIGGER_KEYS[run.trigger])} ·{' '}
                  <time dateTime={run.requestedAt.toISOString()}>
                    {formatTime(run.requestedAt, now, translator).label}
                  </time>
                  {run.bundleName !== null && (
                    <>
                      {' · '}
                      <code className="text-xs">{run.bundleName}</code>
                    </>
                  )}
                  {run.sizeBytes !== null && ` · ${formatBytes(run.sizeBytes)}`}
                  {run.shipped && ` · ${t('adminBackups.runs.shipped')}`}
                  {run.skippedKeys > 0 &&
                    ` · ${t('adminBackups.runs.skipped', { count: run.skippedKeys })}`}
                </span>
                {run.error !== null && (
                  <span className="block text-xs text-destructive">{run.error}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PanelPage>
  )
}
