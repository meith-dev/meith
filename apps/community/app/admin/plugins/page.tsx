import type { Metadata } from 'next'

import { cn, TextLink } from '@meith/ui'

import { MarketplaceRefreshForm } from '@/components/admin/marketplace-forms'
import { PluginEnableForm, PluginHealthResetForm } from '@/components/admin/plugin-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE, PANEL_ROW } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { marketplaceUpdates } from '@/server/marketplace-admin'
import { hookListeners, pluginInventory } from '@/server/plugin-admin'
import { marketplaceFormsCopy, pluginFormsCopy } from '@/view/admin-panel-copy'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.plugins') }
}

export default async function AdminPluginsPage() {
  const t = await getTranslator()
  if ((await adminPageContext()) === null) return null

  const { plugins, migrationsKnown } = await pluginInventory(t)
  const listeners = hookListeners()
  const copy = pluginFormsCopy(t)
  const marketplaceCopy = marketplaceFormsCopy(t)
  const updates = await marketplaceUpdates('plugin')
  const now = new Date()

  return (
    <PanelPage
      title={t.t('page.plugins')}
      lede={
        <>
          {t.t('adminPlugins.ledeBefore')} <code className="text-xs">meith.config.ts</code>{' '}
          {t.t('adminPlugins.ledeAfter')}
        </>
      }
    >
      <section className="flex flex-wrap items-center justify-between gap-3">
        <p className={PANEL_NOTE}>
          {updates.unreachable
            ? t.t('adminMarketplace.unreachable')
            : updates.hasEverFetched && updates.fetchedAt !== null
              ? t.t('adminMarketplace.lastChecked', {
                  time: formatTime(updates.fetchedAt, now, t).label,
                })
              : t.t('adminMarketplace.neverChecked')}
        </p>
        <MarketplaceRefreshForm copy={marketplaceCopy} />
      </section>

      {plugins.length === 0 ? (
        <p className={PANEL_NOTE}>{t.t('page.no-plugins-configured-this-board')}</p>
      ) : (
        <ul className={PANEL_LIST}>
          {plugins.map((plugin) => {
            const pending = plugin.migrations.filter((migration) => !migration.applied).length
            const latestVersion = updates.latestByKey.get(plugin.key) ?? null

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
                      {t.t('adminPlugins.configDisabled')}
                    </span>
                  ) : !plugin.operatorEnabled ? (
                    <span className="text-xs text-muted-foreground">
                      {t.t('page.switched-off-here-its-hooks')}
                    </span>
                  ) : plugin.health?.disabledReason != null ? (
                    <span className="text-xs text-destructive">
                      {t.t('adminPlugins.serverDisabled', { reason: plugin.health.disabledReason })}
                    </span>
                  ) : null}

                  {plugin.durableHealth !== null && plugin.durableHealth.failures > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t.t('adminPlugins.recordedFailures', {
                        count: plugin.durableHealth.failures,
                      })}
                    </span>
                  )}

                  {pending > 0 && migrationsKnown && (
                    <span className="text-xs text-destructive">
                      {t.t('adminPlugins.pendingMigrations', { count: pending })}
                    </span>
                  )}

                  {latestVersion !== null && (
                    <span className="w-fit rounded-full border border-border bg-accent px-2 py-0.5 text-xs font-medium text-foreground">
                      {t.t('adminMarketplace.updateAvailable', { version: latestVersion })}
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
                  <TextLink href={`/admin/plugins/${plugin.key}`} size="sm">
                    {t.t('adminPlugins.details')}
                  </TextLink>
                  {plugin.durableHealth?.disabledAt != null && (
                    <PluginHealthResetForm pluginKey={plugin.key} copy={copy} />
                  )}
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

      {!migrationsKnown && <p className={PANEL_NOTE}>{t.t('adminPlugins.migrationsUnknown')}</p>}

      {listeners.length > 0 && (
        <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
          <h2 className="font-heading text-lg font-semibold">{t.t('page.hooks-use')}</h2>
          <p className="text-muted-foreground">{t.t('adminPlugins.hooksHint')}</p>
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
        <p className="text-muted-foreground">{t.t('adminPlugins.installingHint')}</p>
        <p className="text-muted-foreground">{t.t('adminPlugins.duplicateHint')}</p>
        <p className="text-muted-foreground">{t.t('adminPlugins.uninstallHint')}</p>
      </section>
    </PanelPage>
  )
}
