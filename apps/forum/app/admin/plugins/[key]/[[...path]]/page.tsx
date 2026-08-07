import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PluginEnableForm, PluginSettingsForm } from '@/components/admin/plugin-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { requireAdmin } from '@/server/admin'
import { pluginRow } from '@/server/plugin-admin'
import { renderPluginAdminPage } from '@/server/plugin-pages'

export const metadata: Metadata = { title: 'Plugin' }

/**
 * F69 — one plugin's screen, and the mount point for the pages it contributes.
 *
 * **Two screens in one route, and it is one route on purpose.** `[key]` with an
 * optional catch-all matches both `/admin/plugins/<key>` and
 * `/admin/plugins/<key>/<page>`, which is what makes a contributed page a
 * *child* of the plugin it belongs to rather than a sibling of it. The
 * alternative — a fixed segment like `/admin/plugins/hooks` for the detail view
 * — has a collision built into it: `hooks` is a legal plugin key, so the day
 * somebody installs a plugin called `hooks` their pages disappear behind a
 * panel screen. A route that a plugin key can shadow is a route that will be.
 *
 * A page is rendered by calling the plugin, which means it is the one place in
 * the panel where markup comes from installed code. What that does and does not
 * get is in `plugin-pages.ts`; the short version is that it gets settings and a
 * logger, and does not get the actor, the database or the request.
 */
export default async function AdminPluginPage({
  params,
}: {
  params: Promise<{ key: string; path?: string[] }>
}) {
  await requireAdmin()

  const { key, path } = await params
  const plugin = await pluginRow(key)
  if (plugin === null) notFound()

  const segments = path ?? []

  /*
   * Deeper than one segment is a 404 rather than a match on the first: page
   * paths are validated as a single segment by `definePlugin`, so
   * `/admin/plugins/x/page/anything` is a URL no plugin can have declared.
   */
  if (segments.length > 1) notFound()

  if (segments.length === 1) {
    const rendered = await renderPluginAdminPage(key, segments[0] as string)
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
        {rendered.node === null ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            This page failed to render. The plugin&rsquo;s error is in the server log, and
            the rest of the panel is unaffected.
          </p>
        ) : (
          <section className="rounded-lg border border-border p-4">
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
      {/*
        The three states, spelled out rather than folded into a badge. Each has
        a different remedy and the row says which one applies.
      */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Status</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">In this build</dt>
            <dd>
              {plugin.hasDefinition
                ? plugin.configuredEnabled
                  ? 'yes'
                  : 'registered, but disabled in forum.config.ts'
                : 'a key with no definition'}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Switched on here</dt>
            <dd>
              {plugin.operatorEnabled ? 'yes' : 'no — an administrator turned it off'}
            </dd>
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
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="font-heading text-lg font-semibold">Health</h2>
          <p className="text-sm text-muted-foreground">
            Counted by <em>this</em> server since it started, not across the board and not
            since the plugin was installed. On a platform that recycles instances these
            numbers reset without warning, which is why they are a symptom to look at
            rather than a total to trust.
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
              Last failure in{' '}
              <code className="text-xs">{plugin.health.lastError.hook}</code>:{' '}
              {plugin.health.lastError.message}
            </p>
          )}
        </section>
      )}

      {visibleSettings.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="font-heading text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Stored under this plugin&rsquo;s own namespace, so two plugins cannot collide
            and neither can reach a board setting.
          </p>
          <PluginSettingsForm pluginKey={plugin.key} settings={visibleSettings} />
        </section>
      )}

      {plugin.migrations.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="font-heading text-lg font-semibold">Migrations</h2>
          <p className="text-sm text-muted-foreground">
            Applied by <code className="text-xs">forum upgrade</code>, in one transaction
            each, recorded as they run. There is no button here on purpose: schema changes
            belong to the deploy that shipped the code expecting them, and a panel that
            could run them out of band is a panel that can put a board&rsquo;s schema
            ahead of its code.
          </p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {plugin.migrations.map((migration) => (
              <li key={migration.id} className="flex justify-between gap-3 py-2">
                <code className="text-xs">{migration.id}</code>
                <span
                  className={
                    migration.applied
                      ? 'text-xs text-muted-foreground'
                      : 'text-xs text-destructive'
                  }
                >
                  {migration.applied ? 'applied' : 'not applied'}
                </span>
              </li>
            ))}
          </ul>
          {pendingMigrations.length > 0 && (
            <p className="text-sm text-destructive">
              Run <code className="text-xs">forum upgrade</code> before relying on this
              plugin — until then its code is running against a schema that does not have
              what it expects.
            </p>
          )}
        </section>
      )}

      {plugin.pages.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="font-heading text-lg font-semibold">Pages</h2>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {plugin.pages.map((page) => (
              <li key={page.path} className="flex justify-between gap-3 py-2">
                <a
                  href={page.href}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {page.title}
                </a>
                <code className="text-xs text-muted-foreground">{page.href}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plugin.tasks.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="font-heading text-lg font-semibold">Scheduled tasks</h2>
          <p className="text-sm text-muted-foreground">
            Registered in the board&rsquo;s own task registry and run by the same tick.
            Their runs and failures are on the{' '}
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
                <span className="text-xs text-muted-foreground">
                  every {task.intervalSeconds}s
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(plugin.hooks.length > 0 || plugin.regions.length > 0) && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
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
