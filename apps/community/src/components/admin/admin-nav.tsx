import { PanelNavRegion } from '@/components/shell/panel-nav'
import { currentLocation } from '@/server/current-location'
import { getTranslator } from '@/server/i18n'
import { pluginPanelSection } from '@/server/plugin-panel'
import { ADMIN_OVERVIEW, adminNavWithPlugin, pluginKeyAt } from '@/view/admin-nav'
import { pluginNavChildren } from '@/view/plugin-panel'

export async function AdminNav() {
  const pluginKey = pluginKeyAt(await currentLocation())
  const plugin = pluginKey === null ? null : await pluginPanelSection(pluginKey)

  return (
    <PanelNavRegion
      panel="admincp"
      nav={adminNavWithPlugin(
        plugin === null
          ? null
          : { key: plugin.key, name: plugin.name, pages: pluginNavChildren(plugin.pages) },
        await getTranslator(),
      )}
      overviewHref={ADMIN_OVERVIEW.href}
      fallbackHref={ADMIN_OVERVIEW.href}
    />
  )
}
