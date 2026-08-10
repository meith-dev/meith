import type { InstalledPlugin } from '@meith/core'
import type { PluginDefinition } from '@meith/plugin-kit'

export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = []

export function installedPluginDefinitions(): readonly PluginDefinition[] {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin as PluginDefinition)
}
