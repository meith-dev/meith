import type { Translator } from '@meith/i18n'
import type { ListingStatus } from '@meith/marketplace'

import type { ViewTab } from '@/components/shell/view-tabs'

export type StatusTone = 'active' | 'muted' | 'warning' | 'destructive'

export interface StatusBadge {
  readonly label: string
  readonly tone: StatusTone
}

const STATUS_KEYS: Readonly<Record<ListingStatus, string>> = {
  active: 'adminMarketplace.status.active',
  'installed-disabled': 'adminMarketplace.status.installedDisabled',
  'not-installed': 'adminMarketplace.status.notInstalled',
  'update-available': 'adminMarketplace.status.updateAvailable',
  incompatible: 'adminMarketplace.status.incompatible',
}

const STATUS_TONES: Readonly<Record<ListingStatus, StatusTone>> = {
  active: 'active',
  'installed-disabled': 'muted',
  'not-installed': 'muted',
  'update-available': 'warning',
  incompatible: 'destructive',
}

export function statusBadge(status: ListingStatus, t: Translator): StatusBadge {
  return { label: t.t(STATUS_KEYS[status]), tone: STATUS_TONES[status] }
}

export function catalogTabs(input: {
  readonly installedHref: string
  readonly browseHref: string
  readonly current: 'installed' | 'browse'
  readonly t: Translator
}): readonly ViewTab[] {
  return [
    {
      href: input.installedHref,
      label: input.t.t('adminMarketplace.tab.installed'),
      isCurrent: input.current === 'installed',
    },
    {
      href: input.browseHref,
      label: input.t.t('adminMarketplace.tab.browse'),
      isCurrent: input.current === 'browse',
    },
  ]
}
