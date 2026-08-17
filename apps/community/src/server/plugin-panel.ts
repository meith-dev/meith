import 'server-only'

import { pluginAdminPath, type PluginDefinition } from '@meith/plugin-kit'

import forumConfig from '../../community.config'
import { getSettingOverrides } from './settings'
import type { PluginPage } from '@/view/plugin-panel'

export interface PluginPanelSection {
  readonly key: string
  readonly name: string
  readonly pages: readonly PluginPage[]
}

export async function pluginPanelSection(
  pluginKey: string,
): Promise<PluginPanelSection | null> {
  const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === pluginKey)
  const definition = entry?.plugin as PluginDefinition | undefined

  if (entry === undefined || definition === undefined) return null
  if (entry.enabled === false) return null

  const pages = definition.adminPages ?? []
  if (pages.length === 0) return null

  const overrides = await getSettingOverrides()
  if (overrides.get(`plugin.${pluginKey}._enabled`) === '0') return null

  return {
    key: pluginKey,
    name: definition.name,
    pages: pages.map((page) => ({
      path: page.path,
      title: page.title,
      href: pluginAdminPath(pluginKey, page.path),
    })),
  }
}
