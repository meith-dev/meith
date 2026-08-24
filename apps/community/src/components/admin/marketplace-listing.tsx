import type { Translator } from '@meith/i18n'
import { cn } from '@meith/ui'

import { PANEL_CARD } from '@/components/shell/panel-list'
import type { MarketplaceListingRow } from '@/server/marketplace-admin'
import { type StatusTone, statusBadge } from '@/view/marketplace-panel'

const TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  active: 'bg-primary text-primary-foreground',
  muted: 'border border-border text-muted-foreground',
  warning: 'border border-border bg-accent text-foreground font-medium',
  destructive: 'bg-destructive/10 text-destructive',
}

/**
 * One catalog entry, plugin or theme alike — the row model already carries
 * everything both browse pages need, so this is the one place that renders
 * it. Every string here is either our own catalog copy or a value from
 * `MarketplaceListingRow`, which has already capped lengths and validated
 * URLs against the untrusted feed (see `apps/community/src/server/marketplace-admin.ts`);
 * nothing here uses `dangerouslySetInnerHTML`, so the feed's own text is
 * rendered as plain text no matter what it contains.
 */
export function MarketplaceListingCard({
  listing,
  t,
}: {
  listing: MarketplaceListingRow
  t: Translator
}) {
  const badge = statusBadge(listing.status, t)

  return (
    <li className={cn(PANEL_CARD, 'gap-3')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{listing.name}</span>
            <span className="text-xs text-muted-foreground">{listing.version}</span>
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {listing.key} · {listing.package}
          </span>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs', TONE_CLASS[badge.tone])}>
          {badge.label}
        </span>
      </div>

      {listing.screenshotHrefs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {listing.screenshotHrefs.map((href) => (
            <img
              key={href}
              src={href}
              alt=""
              loading="lazy"
              className="h-28 w-auto rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{listing.description}</p>

      {listing.status === 'incompatible' && listing.incompatibleReason !== null && (
        <p className="text-sm text-destructive">{listing.incompatibleReason}</p>
      )}

      {listing.status === 'update-available' && listing.installedVersion !== null && (
        <p className="text-xs text-muted-foreground">
          {t.t('adminMarketplace.installedVersion', { version: listing.installedVersion })}
        </p>
      )}

      {listing.installSteps !== null && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3 text-sm">
          <p className="font-medium">{t.t('adminMarketplace.installSteps')}</p>
          <ol className="flex flex-col gap-1">
            {listing.installSteps.map((step) => (
              <li key={step} className="text-xs">
                {step.startsWith('pnpm ') || step.startsWith('community ') ? (
                  <code className="rounded bg-muted px-1.5 py-0.5">{step}</code>
                ) : (
                  <span className="text-muted-foreground">{step}</span>
                )}
              </li>
            ))}
          </ol>
          <a
            href="https://www.meith.dev/docs/marketplace"
            rel="noopener noreferrer"
            className="w-fit text-xs font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {t.t('adminMarketplace.installDocsLink')}
          </a>
          {listing.onStockImage && (
            <a
              href="https://www.meith.dev/docs/marketplace#moving-to-a-custom-board"
              rel="noopener noreferrer"
              className="w-fit text-xs font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {t.t('adminMarketplace.graduationLink')}
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{listing.licence}</span>
        {listing.repositoryUrl !== null && (
          <a
            href={listing.repositoryUrl}
            rel="noopener noreferrer"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {t.t('adminMarketplace.repository')}
          </a>
        )}
      </div>
    </li>
  )
}
