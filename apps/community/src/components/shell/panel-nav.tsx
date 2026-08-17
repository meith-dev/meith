import type { PanelKind } from '@meith/theme-kit'
import { requireSlot } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { currentLocation } from '@/server/current-location'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'
import { buildPanelNavModel, type PanelCounts, type PanelNav } from '@/view/panel-nav'

export interface PanelNavProps {
  readonly panel: PanelKind
  readonly nav: PanelNav
  readonly overviewHref: string
  readonly fallbackHref?: string
  readonly counts?: PanelCounts
}

export async function PanelNavRegion(props: PanelNavProps) {
  const Nav = requireSlot(await currentTheme(), 'PanelNav')

  const model = buildPanelNavModel({
    panel: props.panel,
    nav: props.nav,
    overviewHref: props.overviewHref,
    location: await currentLocation(),
    fallbackHref: props.fallbackHref,
    counts: props.counts,
    t: await getTranslator(),
  })

  return <Nav {...(await filterView('view.panel-nav', model, viewerRef(await getActor())))} />
}
