import type { PanelKind } from '@meith/theme-kit'
import { requireSlot, slotCopy } from '@meith/theme-kit'

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
  const theme = await currentTheme()
  const Nav = requireSlot(theme, 'PanelNav')
  const translator = await getTranslator()

  const model = buildPanelNavModel({
    panel: props.panel,
    nav: props.nav,
    overviewHref: props.overviewHref,
    location: await currentLocation(),
    fallbackHref: props.fallbackHref,
    counts: props.counts,
    t: translator,
  })

  return (
    <Nav
      {...(await filterView('view.panel-nav', model, viewerRef(await getActor())))}
      copy={slotCopy(theme, 'PanelNav', translator)}
    />
  )
}
