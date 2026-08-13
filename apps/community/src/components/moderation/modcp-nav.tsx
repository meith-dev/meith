import { PanelNavRegion } from '@/components/shell/panel-nav'
import type { PanelCounts, PanelNav as PanelNavTree } from '@/view/panel-nav'
import { MODCP_OVERVIEW } from '@/view/modcp-nav'

export function ModCpNav({
  nav,
  counts,
}: {
  readonly nav: PanelNavTree
  readonly counts: PanelCounts
}) {
  return (
    <PanelNavRegion
      panel="modcp"
      nav={nav}
      overviewHref={MODCP_OVERVIEW.href}
      counts={counts}
    />
  )
}
