import type { Metadata } from 'next'

import { MarketplaceRefreshForm } from '@/components/admin/marketplace-forms'
import { MarketplaceListingCard } from '@/components/admin/marketplace-listing'
import { PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { ViewTabs } from '@/components/shell/view-tabs'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { marketplaceCatalog } from '@/server/marketplace-admin'
import { marketplaceFormsCopy } from '@/view/admin-panel-copy'
import { catalogTabs } from '@/view/marketplace-panel'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('adminMarketplace.browsePluginsTitle') }
}

export default async function AdminPluginsBrowsePage() {
  if ((await adminPageContext()) === null) return null

  const t = await getTranslator()
  const catalog = await marketplaceCatalog('plugin')
  const copy = marketplaceFormsCopy(t)
  const now = new Date()

  return (
    <PanelPage
      title={t.t('adminMarketplace.browsePluginsTitle')}
      lede={t.t('adminMarketplace.browseLede')}
    >
      <ViewTabs
        label={t.t('adminMarketplace.tabsLabel')}
        tabs={catalogTabs({
          installedHref: '/admin/plugins',
          browseHref: '/admin/plugins/browse',
          current: 'browse',
          t,
        })}
        aside={
          catalog.fetchedAt !== null
            ? t.t('adminMarketplace.lastFetched', {
                time: formatTime(catalog.fetchedAt, now, t).label,
              })
            : undefined
        }
      />

      <MarketplaceRefreshForm copy={copy} />

      {catalog.unreachable && <p className={PANEL_NOTE}>{t.t('adminMarketplace.unreachable')}</p>}

      {!catalog.unreachable && !catalog.hasEverFetched && (
        <p className={PANEL_NOTE}>{t.t('adminMarketplace.neverFetched')}</p>
      )}

      {catalog.hasEverFetched && catalog.listings.length === 0 && (
        <p className={PANEL_NOTE}>{t.t('adminMarketplace.emptyPlugins')}</p>
      )}

      {catalog.listings.length > 0 && (
        <ul className="flex flex-col gap-4">
          {catalog.listings.map((listing) => (
            <MarketplaceListingCard key={listing.key} listing={listing} t={t} />
          ))}
        </ul>
      )}
    </PanelPage>
  )
}
