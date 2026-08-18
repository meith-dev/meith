import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import { PluginEnableForm } from '@/components/admin/plugin-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE, PANEL_ROW } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { hookListeners, pluginInventory } from '@/server/plugin-admin'
import { pluginFormsCopy } from '@/view/admin-panel-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.plugins') }
}

export default async function AdminPluginsPage() {
  const t = await getTranslator()
  if ((await adminPageContext()) === null) return null

  const { plugins, migrationsKnown } = await pluginInventory()
  const listeners = hookListeners()
  const copy = pluginFormsCopy(t)

  return (
    <PanelPage
      title={t.t('page.plugins')}
      lede={
        <>
          Everything installable is named in <code className="text-xs">community.config.ts</code> so
          the bundler can see it and the compiler can check it. Nothing is discovered by scanning a
          directory at request time.
        </>
      }
    >
      {plugins.length === 0 ? (
        <p className={PANEL_NOTE}>{t.t('page.no-plugins-configured-this-board')}</p>
      ) : (
        <ul className={PANEL_LIST}>
          {plugins.map((plugin) => {
            const pending = plugin.migrations.filter((migration) => !migration.applied).length

            return (
              <li key={plugin.key} className={PANEL_ROW}>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">
                    {plugin.name ?? plugin.key}
                    {plugin.version !== null && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {plugin.version}
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {plugin.key}
                  </span>

                  {!plugin.hasDefinition ? (
                    <span className="text-xs text-muted-foreground">
                      {t.t('page.registered-without-definition-key-no')}
                    </span>
                  ) : !plugin.configuredEnabled ? (
                    <span className="text-xs text-muted-foreground">
                      Disabled in <code className="text-xs">community.config.ts</code>. Turning it
                      back on is a change to that file and a redeploy.
                    </span>
                  ) : !plugin.operatorEnabled ? (
                    <span className="text-xs text-muted-foreground">
                      {t.t('page.switched-off-here-its-hooks')}
                    </span>
                  ) : plugin.health?.disabledReason != null ? (
                    <span className="text-xs text-destructive">
                      Stopped by this server after repeated failures: {plugin.health.disabledReason}
                    </span>
                  ) : null}

                  {pending > 0 && migrationsKnown && (
                    <span className="text-xs text-destructive">
                      {pending} migration{pending === 1 ? '' : 's'} not applied — run{' '}
                      <code className="text-xs">community upgrade</code>.
                    </span>
                  )}

                  {plugin.pages.length > 0 && (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                      {plugin.pages.map((page) => (
                        <a
                          key={page.path}
                          href={page.href}
                          className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium transition-colors hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {page.title}
                        </a>
                      ))}
                    </span>
                  )}
                </span>

                <span className="flex shrink-0 items-center gap-3">
                  <a
                    href={`/admin/plugins/${plugin.key}`}
                    className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    Details
                  </a>
                  {plugin.configuredEnabled && plugin.hasDefinition && (
                    <PluginEnableForm
                      pluginKey={plugin.key}
                      enabled={plugin.operatorEnabled}
                      copy={copy}
                    />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {!migrationsKnown && (
        <p className={PANEL_NOTE}>
          This board could not be asked which plugin migrations have run, so the rows above do not
          say. On a board running on sample data there is no such table; on a real one, that is
          worth looking into.
        </p>
      )}

      {listeners.length > 0 && (
        <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
          <h2 className="font-heading text-lg font-semibold">{t.t('page.hooks-use')}</h2>
          <p className="text-muted-foreground">
            Only hooks something is listening on. The full list of every extension point is in the
            generated reference, and reproducing all ninety-one here would bury these. Plugins are
            listed in the order they run — priority first, then key — so where two of them change
            the same value, the last one named has the final say.
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {listeners.map((row) => (
              <li key={row.hook} className="flex flex-wrap items-baseline gap-2 py-2">
                <code className="text-xs">{row.hook}</code>
                <span className="text-xs text-muted-foreground">{row.plugins.join(' → ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
        <h2 className="font-heading text-lg font-semibold">{t.t('page.installing-plugin')}</h2>
        <p className="text-muted-foreground">
          A plugin is code, so it has to be in the build before it can run:{' '}
          <code className="text-xs">pnpm add</code> the package, add it to the{' '}
          <code className="text-xs">plugins</code> array in{' '}
          <code className="text-xs">community.config.ts</code>, and redeploy. The same three steps a
          theme takes, and for the same reason — a serverless bundle contains only what the bundler
          saw.
        </p>
        <p className="text-muted-foreground">
          A duplicate key is refused when the configuration loads rather than at first use, so a
          board that boots has a registry that makes sense.
        </p>
        <p className="text-muted-foreground">
          There is no uninstall button, and that is deliberate: removing a plugin is{' '}
          <code className="text-xs">pnpm remove</code>, a line out of that file, and a redeploy. A
          button that dropped a plugin&rsquo;s rows and left its code running would leave the board
          in a state neither installing nor removing produces.
        </p>
      </section>
    </PanelPage>
  )
}
