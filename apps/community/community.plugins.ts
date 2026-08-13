import type { InstalledPlugin } from '@meith/core'
import type { PluginDefinition } from '@meith/plugin-kit'

import { showcasePlugins } from './community.demo.plugins'

export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = [
  ...showcasePlugins(),
]

export function installedPluginDefinitions(): readonly PluginDefinition[] {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin as PluginDefinition)
}
