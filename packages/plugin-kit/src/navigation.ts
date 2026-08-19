import {
  type PluginDefinition,
  type PluginNavigationAudience,
  pluginNavigationKey,
  pluginPagePath,
} from './plugin'

export interface PluginNavigationPlacement {
  readonly key: string
  readonly href: string
  readonly audience: PluginNavigationAudience
  readonly label: string
  readonly labelKey: string | null
  readonly labelArgs: Record<string, string | number> | null
}

export function pluginNavigationPlacements(
  plugins: readonly PluginDefinition[],
): readonly PluginNavigationPlacement[] {
  return plugins.flatMap((plugin) =>
    (plugin.navigation ?? []).map((item) => ({
      key: pluginNavigationKey(plugin.key, item.key),
      href: pluginPagePath(plugin.key, item.path),
      audience: item.audience ?? ('all' as const),
      label: item.label,
      labelKey: item.labelKey ?? null,
      labelArgs: (item.labelArgs ?? null) as Record<string, string | number> | null,
    })),
  )
}

export function pluginKeyOfNavigation(key: string | null): string | null {
  if (key === null) return null

  const parts = key.split('.')
  return parts.length === 3 && parts[0] === 'plugin' ? (parts[1] ?? null) : null
}
