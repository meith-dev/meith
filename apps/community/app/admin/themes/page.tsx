import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import { LogoUploadForm } from '@/components/admin/branding-forms'
import { MarketplaceRefreshForm } from '@/components/admin/marketplace-forms'
import { ThemeStateForms } from '@/components/admin/theme-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE, PANEL_ROW } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { logoKey, logoSrc } from '@/server/branding'
import { getTranslator, tr } from '@/server/i18n'
import { MAX_IMAGE_BYTES } from '@/server/image-upload'
import { marketplaceUpdates } from '@/server/marketplace-admin'
import { themeListing } from '@/server/theme-admin'
import { brandingFormsCopy, marketplaceFormsCopy } from '@/view/admin-panel-copy'
import { themeStateCopy } from '@/view/admin-theme-copy'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.themes') }
}

export default async function AdminThemesPage() {
  if ((await adminPageContext()) === null) return null

  const [themes, lightKey, darkKey, translator] = await Promise.all([
    themeListing(),
    logoKey('light'),
    logoKey('dark'),
    getTranslator(),
  ])
  const now = new Date()
  const brandingCopy = brandingFormsCopy(translator)
  const stateCopy = themeStateCopy(translator)
  const marketplaceCopy = marketplaceFormsCopy(translator)
  const updates = await marketplaceUpdates('theme')

  return (
    <PanelPage title={await tr('page.themes')} lede={translator.t('adminThemes.lede')}>
      <section className="flex flex-wrap items-center justify-between gap-3">
        <p className={PANEL_NOTE}>
          {updates.unreachable
            ? translator.t('adminMarketplace.unreachable')
            : updates.hasEverFetched && updates.fetchedAt !== null
              ? translator.t('adminMarketplace.lastChecked', {
                  time: formatTime(updates.fetchedAt, now, translator).label,
                })
              : translator.t('adminMarketplace.neverChecked')}
        </p>
        <MarketplaceRefreshForm copy={marketplaceCopy} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold">{translator.t('adminThemes.logo')}</h2>
          <p className="text-sm text-muted-foreground">{translator.t('adminThemes.logoHint')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <LogoUploadForm
            maxKib={MAX_IMAGE_BYTES / 1024}
            copy={brandingCopy}
            slot={{
              scheme: 'light',
              label: translator.t('adminThemes.light'),
              hint: translator.t('adminThemes.lightHint'),
              src: lightKey === null ? null : logoSrc('light', lightKey),
            }}
          />
          <LogoUploadForm
            maxKib={MAX_IMAGE_BYTES / 1024}
            copy={brandingCopy}
            slot={{
              scheme: 'dark',
              label: translator.t('adminThemes.dark'),
              hint: translator.t('adminThemes.darkHint'),
              src: darkKey === null ? null : logoSrc('dark', darkKey),
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          What a screen reader announces in place of the logo is{' '}
          <strong>{await tr('page.logo-alt-text')}</strong> under Settings → Board. Left empty it
          becomes the board&rsquo;s name, which is usually what a logo says anyway.
        </p>
      </section>

      <h2 className="font-heading text-lg font-semibold">{await tr('page.installed-themes')}</h2>

      <ul className={PANEL_LIST}>
        {themes.map((theme) => (
          <li key={theme.key} className={PANEL_ROW}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{theme.title}</span>
                {theme.isDefault && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {translator.t('adminThemes.default')}
                  </span>
                )}
                {!theme.enabled && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {translator.t('adminThemes.off')}
                  </span>
                )}
                {theme.isBuildTheme && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {translator.t('adminThemes.buildsOwn')}
                  </span>
                )}
              </span>

              <span className="truncate text-xs text-muted-foreground">
                <code className="text-xs">{theme.key}</code> ·{' '}
                {theme.overriddenTokens === 0 && !theme.hasCustomCss
                  ? translator.t('adminThemes.noChanges')
                  : `${theme.overriddenTokens} colour${theme.overriddenTokens === 1 ? '' : 's'} changed${
                      theme.hasCustomCss ? ', plus custom CSS' : ''
                    }`}
                {theme.updatedAt !== null && (
                  <>
                    {' '}
                    · changed{' '}
                    <time dateTime={theme.updatedAt.toISOString()}>
                      {formatTime(theme.updatedAt, now, translator).label}
                    </time>
                  </>
                )}
              </span>

              {updates.latestByKey.has(theme.key) && (
                <span className="w-fit rounded-full border border-border bg-accent px-2 py-0.5 text-xs font-medium text-foreground">
                  {translator.t('adminMarketplace.updateAvailable', {
                    version: updates.latestByKey.get(theme.key) ?? '',
                  })}
                </span>
              )}
            </span>

            <ThemeStateForms
              themeKey={theme.key}
              title={theme.title}
              enabled={theme.enabled}
              isDefault={theme.isDefault}
              isBuildTheme={theme.isBuildTheme}
              copy={stateCopy}
            />
          </li>
        ))}
      </ul>

      <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminThemes.memberChoice')}
        </h2>
        <p className="text-muted-foreground">
          <strong>{await tr('page.whole-theme')}</strong> — its components as well as its colours. A
          theme that renders forum listings as tables renders them as tables for the member who
          picked it. The choice is a cookie, resolved on the server, so the page arrives already
          correct: no flash, no second paint, and the control works with JavaScript turned off.
        </p>
        <p className="text-muted-foreground">
          {translator.t('adminThemes.tokensOnlyBefore')} <em>only</em>{' '}
          {translator.t('adminThemes.tokensOnlyAfter')}
        </p>
        <p className="text-muted-foreground">
          {translator.t('adminThemes.deployBefore')} <em>exist</em>
          {translator.t('adminThemes.deployAfterExist')} <code className="text-xs">pnpm add</code>{' '}
          {translator.t('adminThemes.deployAfterAdd')}{' '}
          <code className="text-xs">meith.config.ts</code>
          {translator.t('adminThemes.deployAfterConfig')}{' '}
          <code className="text-xs">defaultTheme</code> {translator.t('adminThemes.deployEnd')}
        </p>
      </section>
    </PanelPage>
  )
}
