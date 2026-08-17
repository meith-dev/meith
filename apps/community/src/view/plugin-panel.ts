import { pluginAdminPath } from '@meith/plugin-kit'

import type { PanelSubsection } from './panel-nav'

export interface PluginPage {
  readonly path: string
  readonly title: string
  readonly href: string
}

export interface PluginPanelTab {
  readonly href: string
  readonly label: string
  readonly isCurrent: boolean
}

export const PLUGIN_SETTINGS_TAB = 'Settings'

export function pluginPanelTabs(input: {
  readonly pluginKey: string
  readonly pages: readonly PluginPage[]
  readonly current: string | null
}): readonly PluginPanelTab[] {
  if (input.pages.length === 0) return []

  return [
    {
      href: pluginAdminPath(input.pluginKey, ''),
      label: PLUGIN_SETTINGS_TAB,
      isCurrent: input.current === null,
    },
    ...input.pages.map((page) => ({
      href: page.href,
      label: page.title,
      isCurrent: page.path === input.current,
    })),
  ]
}

export function pluginNavChildren(
  pages: readonly PluginPage[],
): readonly PanelSubsection[] {
  return pages.map((page) => ({ href: page.href, title: page.title }))
}
