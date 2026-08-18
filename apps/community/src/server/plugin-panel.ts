import 'server-only'

import type { Translator } from '@meith/i18n'
import { type PluginDefinition, pluginAdminPath } from '@meith/plugin-kit'

import type { PluginPage } from '@/view/plugin-panel'

import forumConfig from '../../community.config'
import { getSettingOverrides } from './settings'

export interface PluginPanelSection {
  readonly key: string
  readonly name: string
  readonly pages: readonly PluginPage[]
}

export async function pluginPanelSection(
  pluginKey: string,
  t?: Translator,
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
    name:
      t !== undefined && definition.nameKey !== undefined && t.has(definition.nameKey)
        ? t.t(definition.nameKey)
        : definition.name,
    pages: pages.map((page) => ({
      path: page.path,
      title:
        t !== undefined && page.titleKey !== undefined && t.has(page.titleKey)
          ? t.t(page.titleKey, page.titleArgs)
          : page.title,
      href: pluginAdminPath(pluginKey, page.path),
    })),
  }
}
