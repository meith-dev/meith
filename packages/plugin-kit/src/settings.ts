import type { PluginDefinition, PluginSetting, PluginSettingType } from './plugin'

export type PluginSettingValue = string | number | boolean

/** Where a plugin can read its environment from. The host passes core's reader. */
export type PluginEnvReader = (name: string) => string | undefined

export type PluginSettingSource = 'environment' | 'board' | 'default'

export interface ResolvedPluginSetting {
  readonly setting: PluginSetting
  readonly value: PluginSettingValue
  readonly source: PluginSettingSource
  /** `null` when the setting is fine; otherwise a sentence for the panel. */
  readonly problem: string | null
}

export function pluginSettingType(setting: PluginSetting): PluginSettingType {
  if (setting.type !== undefined) return setting.type
  if (typeof setting.default === 'boolean') return 'boolean'
  if (typeof setting.default === 'number') return 'number'
  return 'string'
}

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

function resolveOne(
  plugin: PluginDefinition,
  setting: PluginSetting,
  overrides: ReadonlyMap<string, string>,
  env: PluginEnvReader | undefined,
): ResolvedPluginSetting {
  const type = pluginSettingType(setting)

  const fromEnv = setting.env === undefined ? undefined : env?.(setting.env)
  const stored = overrides.get(`plugin.${plugin.key}.${setting.key}`)

  let value: PluginSettingValue | null = null
  let source: PluginSettingSource = 'default'

  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    value = parsePluginSetting(setting, fromEnv)
    source = 'environment'
  }
  if (value === null && stored !== undefined) {
    value = parsePluginSetting(setting, stored)
    if (value !== null) source = 'board'
  }
  if (value === null) {
    value = setting.default
    source = 'default'
  }

  // A select that resolved to something outside its options is a stored
  // value from an older version of the plugin; fall back rather than hand
  // the plugin a value it never declared.
  if (type === 'select' && !(setting.options ?? []).some((option) => option.value === value)) {
    value = setting.default
    source = 'default'
  }

  const problem =
    setting.required === true && (value === '' || value === null)
      ? setting.env === undefined
        ? `“${setting.label}” is required and not set.`
        : `“${setting.label}” is required — set it here or with ${setting.env}.`
      : null

  return { setting, value, source, problem }
}

export function resolvePluginSettings(
  plugin: PluginDefinition,
  overrides: ReadonlyMap<string, string>,
  env?: PluginEnvReader,
): Readonly<Record<string, PluginSettingValue>> {
  const resolved: Record<string, PluginSettingValue> = {}

  for (const setting of plugin.settings ?? []) {
    resolved[setting.key] = resolveOne(plugin, setting, overrides, env).value
  }

  return resolved
}

/**
 * The panel's view of the same resolution: each setting with the value the
 * plugin will actually see, where it came from, and what is wrong with it.
 * Environment beats board beats default — the same rule as `APP_URL` and the
 * mail settings, reported the same way.
 */
export function resolvePluginSettingDetails(
  plugin: PluginDefinition,
  overrides: ReadonlyMap<string, string>,
  env?: PluginEnvReader,
): readonly ResolvedPluginSetting[] {
  return (plugin.settings ?? []).map((setting) => resolveOne(plugin, setting, overrides, env))
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
