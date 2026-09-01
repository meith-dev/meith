import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TextLink } from '@meith/ui'

import { PluginEnableForm, PluginSettingsForm } from '@/components/admin/plugin-forms'
import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { ViewTabs } from '@/components/shell/view-tabs'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { pluginRow } from '@/server/plugin-admin'
import { renderPluginAdminPage } from '@/server/plugin-pages'
import { pluginFormsCopy } from '@/view/admin-panel-copy'
import { pluginPanelTabs } from '@/view/plugin-panel'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.plugin') }
}

export default async function AdminPluginPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; path?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if ((await adminPageContext()) === null) return null

  const { key, path } = await params
  const t = await getTranslator()
  const plugin = await pluginRow(key, t)
  if (plugin === null) notFound()

  const segments = path ?? []

  if (segments.length > 1) notFound()

  if (segments.length === 1) {
    const query: Record<string, string> = {}
    for (const [name, value] of Object.entries(await searchParams)) {
      if (typeof value === 'string') query[name] = value
      else if (Array.isArray(value) && typeof value[0] === 'string') query[name] = value[0]
    }

    const rendered = await renderPluginAdminPage(key, segments[0] as string, query)
    if (rendered === null) notFound()

    return (
      <PanelPage
        back={{
          href: `/admin/plugins/${key}`,
          label: plugin.name ?? plugin.key,
        }}
        title={rendered.title}
        meta={
          <>
            {t.t('adminPluginDetail.pluginPageMetaBefore')} <code className="font-mono">{key}</code>{' '}
            {t.t('adminPluginDetail.pluginPageMetaAfter')}
          </>
        }
      >
        <ViewTabs
          label={t.t('adminPluginDetail.screens', { plugin: plugin.name ?? plugin.key })}
          tabs={pluginPanelTabs({
            pluginKey: key,
            pages: plugin.pages,
            current: segments[0] as string,
          })}
        />

        {rendered.node === null ? (
          <p className={PANEL_NOTE}>{t.t('adminPluginDetail.pluginPageError')}</p>
        ) : (
          <section className="rounded-xl border border-border bg-surface p-4">
            {rendered.node}
          </section>
        )}
      </PanelPage>
    )
  }

  const visibleSettings = plugin.settings
  const pendingMigrations = plugin.migrations.filter((migration) => !migration.applied)
  const copy = pluginFormsCopy(t)

  return (
    <PanelPage
      back={{ href: '/admin/plugins', label: t.t('adminPluginDetail.allPlugins') }}
      title={plugin.name ?? plugin.key}
      gap="loose"
      lede={
        <>
          <code className="font-mono text-xs">{plugin.key}</code>
          {plugin.version !== null && ` · ${plugin.version}`}
          {plugin.description !== null && ` — ${plugin.description}`}
        </>
      }
      {...(plugin.dependsOn.length > 0
        ? {
            meta: t.t('adminPluginDetail.dependsOn', { plugins: plugin.dependsOn.join(', ') }),
          }
        : {})}
    >
      <ViewTabs
        label={t.t('adminPluginDetail.screens', { plugin: plugin.name ?? plugin.key })}
        tabs={pluginPanelTabs({ pluginKey: key, pages: plugin.pages, current: null })}
      />

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t.t('adminPluginDetail.status')}</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{await tr('page.this-build')}</dt>
            <dd>
              {plugin.hasDefinition
                ? plugin.configuredEnabled
                  ? t.t('adminPluginDetail.yes')
                  : t.t('adminPluginDetail.runningRegisteredDisabled')
                : t.t('adminPluginDetail.runningUndefined')}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{await tr('page.switched-here')}</dt>
            <dd>
              {plugin.operatorEnabled
                ? t.t('adminPluginDetail.yes')
                : t.t('adminPluginDetail.runningNoDisabled')}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{await tr('page.running-this-server')}</dt>
            <dd>
              {plugin.running
                ? t.t('adminPluginDetail.yes')
                : (plugin.health?.disabledReason ?? t.t('adminPluginDetail.runningNo'))}
            </dd>
          </div>
        </dl>

        {plugin.configuredEnabled && plugin.hasDefinition && (
          <div className="max-w-40">
            <PluginEnableForm pluginKey={plugin.key} enabled={plugin.operatorEnabled} copy={copy} />
          </div>
        )}
      </section>

      {plugin.health !== null && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">{t.t('adminPluginDetail.health')}</h2>
          <p className="text-sm text-muted-foreground">{t.t('adminPluginDetail.healthHint')}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t.t('adminPluginDetail.calls')}</dt>
              <dd className="text-lg">{plugin.health.calls}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.t('adminPluginDetail.failures')}</dt>
              <dd className="text-lg">{plugin.health.failures}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{await tr('page.slow-calls')}</dt>
              <dd className="text-lg">{plugin.health.slowCalls}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{await tr('page.total-time')}</dt>
              <dd className="text-lg">{plugin.health.totalMs} ms</dd>
            </div>
          </dl>
          {plugin.health.lastError !== null && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              {t.t('adminPluginDetail.lastFailure', {
                hook: plugin.health.lastError.hook,
                message: plugin.health.lastError.message,
              })}
            </p>
          )}
        </section>
      )}

      {visibleSettings.length > 0 && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {t.t('adminPluginDetail.settings')}
          </h2>
          <p className="text-sm text-muted-foreground">{t.t('adminPluginDetail.settingsHint')}</p>
          <PluginSettingsForm pluginKey={plugin.key} settings={visibleSettings} copy={copy} />
        </section>
      )}

      {plugin.migrations.length > 0 && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {t.t('adminPluginDetail.migrations')}
          </h2>
          <p className="text-sm text-muted-foreground">{t.t('adminPluginDetail.migrationsHint')}</p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {plugin.migrations.map((migration) => (
              <li key={migration.id} className="flex justify-between gap-3 py-2">
                <code className="text-xs">{migration.id}</code>
                <span
                  className={
                    migration.applied ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'
                  }
                >
                  {migration.applied
                    ? t.t('adminPluginDetail.applied')
                    : t.t('adminPluginDetail.notApplied')}
                </span>
              </li>
            ))}
          </ul>
          {pendingMigrations.length > 0 && (
            <p className="text-sm text-destructive">{t.t('adminPluginDetail.runUpgrade')}</p>
          )}
        </section>
      )}

      {plugin.tasks.length > 0 && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">{await tr('page.scheduled-tasks')}</h2>
          <p className="text-sm text-muted-foreground">
            {t.t('adminPluginDetail.tasksHintBefore')}{' '}
            <TextLink href="/admin/system">{t.t('page.system-health')}</TextLink>{' '}
            {t.t('adminPluginDetail.tasksHintAfter')}
          </p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {plugin.tasks.map((task) => (
              <li key={task.id} className="flex justify-between gap-3 py-2">
                <code className="text-xs">{task.registeredId}</code>
                <span className="text-xs text-muted-foreground">
                  {t.t('adminPluginDetail.every', { seconds: task.intervalSeconds })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(plugin.hooks.length > 0 || plugin.regions.length > 0) && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {t.t('adminPluginDetail.whatItAttaches')}
          </h2>
          {plugin.hooks.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">{t.t('adminPluginDetail.hooks')}</h3>
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                {plugin.hooks.map((hook) => (
                  <code key={hook} className="text-xs text-muted-foreground">
                    {hook}
                  </code>
                ))}
              </p>
            </div>
          )}
          {plugin.regions.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">{t.t('adminPluginDetail.regions')}</h3>
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                {plugin.regions.map((region) => (
                  <code key={region} className="text-xs text-muted-foreground">
                    {region}
                  </code>
                ))}
              </p>
            </div>
          )}
        </section>
      )}
    </PanelPage>
  )
}
