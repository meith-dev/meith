import { PanelNavRegion } from '@/components/shell/panel-nav'
import { getActor } from '@/server/context'
import { currentLocation } from '@/server/current-location'
import { getTranslator } from '@/server/i18n'
import { pluginPanelSection } from '@/server/plugin-panel'
import { filterView, viewerRef } from '@/server/plugin-view'
import { ADMIN_OVERVIEW, adminNavWithPlugin, pluginKeyAt } from '@/view/admin-nav'
import type { PanelNav, PanelSection } from '@/view/panel-nav'
import { pluginNavChildren } from '@/view/plugin-panel'

/**
 * A plugin may reorder, drop, or add a section here. A link it adds reaches a
 * page it declared and nothing else — the panel re-checks who is asking.
 */
async function withPluginSections(nav: PanelNav, t: Awaited<ReturnType<typeof getTranslator>>) {
  const links = await filterView(
    'admin.navigation',
    nav.map((section) => ({
      label: section.titleText ?? (section.titleKey === undefined ? '' : t.t(section.titleKey)),
      href: section.href,
    })),
    viewerRef(await getActor()),
  )

  const byHref = new Map(nav.map((section) => [section.href, section]))
  return links.map(
    (link): PanelSection =>
      byHref.get(link.href) ?? { href: link.href, titleText: link.label, icon: 'plugins' },
  )
}

export async function AdminNav() {
  const t = await getTranslator()
  const pluginKey = pluginKeyAt(await currentLocation())
  const plugin = pluginKey === null ? null : await pluginPanelSection(pluginKey, t)

  const nav = adminNavWithPlugin(
    plugin === null
      ? null
      : { key: plugin.key, name: plugin.name, pages: pluginNavChildren(plugin.pages) },
    t,
  )

  return (
    <PanelNavRegion
      panel="admincp"
      nav={await withPluginSections(nav, t)}
      overviewHref={ADMIN_OVERVIEW.href}
      fallbackHref={ADMIN_OVERVIEW.href}
    />
  )
}
