import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PluginEnableForm, PluginSettingsForm } from '@/components/admin/plugin-forms'
import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { ViewTabs } from '@/components/shell/view-tabs'
import { adminPageContext } from '@/server/admin'
import { tr } from '@/server/i18n'
import { pluginRow } from '@/server/plugin-admin'
import { renderPluginAdminPage } from '@/server/plugin-pages'
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
  const plugin = await pluginRow(key)
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
            Rendered by the <code className="font-mono">{key}</code> plugin.
          </>
        }
      >
        <ViewTabs
          label={`${plugin.name ?? plugin.key} screens`}
          tabs={pluginPanelTabs({
            pluginKey: key,
            pages: plugin.pages,
            current: segments[0] as string,
          })}
        />

        {rendered.node === null ? (
          <p className={PANEL_NOTE}>
            This page failed to render. The plugin&rsquo;s error is in the server log, and the rest
            of the panel is unaffected.
          </p>
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

  return (
    <PanelPage
      back={{ href: '/admin/plugins', label: 'All plugins' }}
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
            meta: `Needs ${plugin.dependsOn.join(', ')} installed and upgraded first.`,
          }
        : {})}
    >
      <ViewTabs
        label={`${plugin.name ?? plugin.key} screens`}
        tabs={pluginPanelTabs({ pluginKey: key, pages: plugin.pages, current: null })}
      />

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">Status</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">In this build</dt>
            <dd>
              {plugin.hasDefinition
                ? plugin.configuredEnabled
                  ? 'yes'
                  : 'registered, but disabled in community.config.ts'
                : 'a key with no definition'}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Switched on here</dt>
            <dd>{plugin.operatorEnabled ? 'yes' : 'no — an administrator turned it off'}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Running on this server</dt>
            <dd>{plugin.running ? 'yes' : (plugin.health?.disabledReason ?? 'no')}</dd>
          </div>
        </dl>

        {plugin.configuredEnabled && plugin.hasDefinition && (
          <div className="max-w-40">
            <PluginEnableForm pluginKey={plugin.key} enabled={plugin.operatorEnabled} />
          </div>
        )}
      </section>

      {plugin.health !== null && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">Health</h2>
          <p className="text-sm text-muted-foreground">
            Counted by <em>this</em> server since it started, not across the board and not since the
            plugin was installed. On a platform that recycles instances these numbers reset without
            warning, which is why they are a symptom to look at rather than a total to trust.
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Calls</dt>
              <dd className="text-lg">{plugin.health.calls}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Failures</dt>
              <dd className="text-lg">{plugin.health.failures}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Slow calls</dt>
              <dd className="text-lg">{plugin.health.slowCalls}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total time</dt>
              <dd className="text-lg">{plugin.health.totalMs} ms</dd>
            </div>
          </dl>
          {plugin.health.lastError !== null && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              Last failure in <code className="text-xs">{plugin.health.lastError.hook}</code>:{' '}
              {plugin.health.lastError.message}
            </p>
          )}
        </section>
      )}

      {visibleSettings.length > 0 && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Stored under this plugin&rsquo;s own namespace, so two plugins cannot collide and
            neither can reach a board setting.
          </p>
          <PluginSettingsForm pluginKey={plugin.key} settings={visibleSettings} />
        </section>
      )}

      {plugin.migrations.length > 0 && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">Migrations</h2>
          <p className="text-sm text-muted-foreground">
            Applied by <code className="text-xs">community upgrade</code>, in one transaction each,
            recorded as they run. There is no button here on purpose: schema changes belong to the
            deploy that shipped the code expecting them, and a panel that could run them out of band
            is a panel that can put a board&rsquo;s schema ahead of its code.
          </p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {plugin.migrations.map((migration) => (
              <li key={migration.id} className="flex justify-between gap-3 py-2">
                <code className="text-xs">{migration.id}</code>
                <span
                  className={
                    migration.applied ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'
                  }
                >
                  {migration.applied ? 'applied' : 'not applied'}
                </span>
              </li>
            ))}
          </ul>
          {pendingMigrations.length > 0 && (
            <p className="text-sm text-destructive">
              Run <code className="text-xs">community upgrade</code> before relying on this plugin —
              until then its code is running against a schema that does not have what it expects.
            </p>
          )}
        </section>
      )}

      {plugin.tasks.length > 0 && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">Scheduled tasks</h2>
          <p className="text-sm text-muted-foreground">
            Registered in the board&rsquo;s own task registry and run by the same tick. Their runs
            and failures are on the{' '}
            <a
              href="/admin/system"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              system health
            </a>{' '}
            screen with everything else.
          </p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {plugin.tasks.map((task) => (
              <li key={task.id} className="flex justify-between gap-3 py-2">
                <code className="text-xs">{task.registeredId}</code>
                <span className="text-xs text-muted-foreground">every {task.intervalSeconds}s</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(plugin.hooks.length > 0 || plugin.regions.length > 0) && (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">What it attaches to</h2>
          {plugin.hooks.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">Hooks</h3>
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
              <h3 className="text-sm font-medium">Regions</h3>
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
