import type { PluginDefinition, PluginSetting } from './plugin'

export type PluginSettingValue = string | number | boolean

const ENABLED_SUFFIX = '_enabled'

export function pluginEnabledKey(pluginKey: string): string {
  return `plugin.${pluginKey}.${ENABLED_SUFFIX}`
}

export function serialisePluginSetting(value: PluginSettingValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

export function parsePluginSetting(
  setting: PluginSetting,
  raw: string,
): PluginSettingValue | null {
  if (typeof setting.default === 'boolean') {
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    return null
  }

  if (typeof setting.default === 'number') {
    if (raw.trim() === '') return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  return raw
}

export function resolvePluginSettings(
  plugin: PluginDefinition,
  overrides: ReadonlyMap<string, string>,
): Readonly<Record<string, PluginSettingValue>> {
  const resolved: Record<string, PluginSettingValue> = {}

  for (const setting of plugin.settings ?? []) {
    const stored = overrides.get(`plugin.${plugin.key}.${setting.key}`)
    const parsed = stored === undefined ? null : parsePluginSetting(setting, stored)
    resolved[setting.key] = parsed ?? setting.default
  }

  return resolved
}

export function operatorDisabledPlugins(
  overrides: ReadonlyMap<string, string>,
): readonly string[] {
  const disabled: string[] = []

  for (const [key, value] of overrides) {
    if (!key.startsWith('plugin.') || !key.endsWith(`.${ENABLED_SUFFIX}`)) continue
    if (value !== '0') continue

    const pluginKey = key.slice('plugin.'.length, -`.${ENABLED_SUFFIX}`.length)
    if (pluginKey !== '' && !pluginKey.includes('.')) disabled.push(pluginKey)
  }

  return disabled.sort()
}
