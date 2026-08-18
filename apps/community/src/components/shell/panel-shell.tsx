import type { LinkModel, PanelKind } from '@meith/theme-kit'
import { requireSlot, slotCopy } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'

export interface PanelShellProps {
  readonly panel: PanelKind
  readonly nav: React.ReactNode
  readonly links?: readonly LinkModel[]
  readonly children: React.ReactNode
}

export async function PanelShell({ panel, nav, links = [], children }: PanelShellProps) {
  const theme = await currentTheme()
  const Shell = requireSlot(theme, 'PanelShell')

  const model = await filterView(
    'view.panel-shell',
    { panel, links, linksLabel: await tr('panel.otherPanels'), regions: { nav } },
    viewerRef(await getActor()),
  )

  return (
    <Shell {...model} copy={slotCopy(theme, 'PanelShell', await getTranslator())}>
      {children}
    </Shell>
  )
}
