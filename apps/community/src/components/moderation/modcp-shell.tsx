import { notFound } from 'next/navigation'

import { ModCpNav } from '@/components/moderation/modcp-nav'
import { PanelShell } from '@/components/shell/panel-shell'
import { getActor } from '@/server/context'
import { currentLocation } from '@/server/current-location'
import { getTranslator } from '@/server/i18n'
import { modCpCounts, resolveModCpAccess } from '@/server/modcp'
import { pluginStaffPanelSection } from '@/server/plugin-panel'
import { modCpNavWithPlugin, pluginKeyAtModCp } from '@/view/modcp-nav'
import { pluginNavChildren } from '@/view/plugin-panel'
import { buildPanelLinks } from '@/view/shell'

export async function ModCpShell({ children }: { children: React.ReactNode }) {
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const t = await getTranslator()
  const counts = await modCpCounts()

  const pluginKey = pluginKeyAtModCp(await currentLocation())
  const plugin = pluginKey === null ? null : await pluginStaffPanelSection(pluginKey, t)
  const nav = modCpNavWithPlugin(
    access,
    plugin === null
      ? null
      : { key: plugin.key, name: plugin.name, pages: pluginNavChildren(plugin.pages) },
    t,
  )

  const actor = await getActor()
  const links = buildPanelLinks({
    t,
    current: 'modcp',
    canAccessAdminCp: actor.global.canAccessAdminCp === true,
  })

  return (
    <PanelShell
      panel="modcp"
      nav={
        <ModCpNav
          nav={nav}
          counts={{
            '/moderation': counts.pending,
            '/moderation/reports': counts.openReports,
          }}
        />
      }
      links={links}
    >
      {children}
    </PanelShell>
  )
}
