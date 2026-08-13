import { PanelNavRegion } from '@/components/shell/panel-nav'
import { ADMIN_NAV, ADMIN_OVERVIEW } from '@/view/admin-nav'

export function AdminNav() {
  return (
    <PanelNavRegion
      panel="admincp"
      nav={ADMIN_NAV}
      overviewHref={ADMIN_OVERVIEW.href}
      fallbackHref={ADMIN_OVERVIEW.href}
    />
  )
}
