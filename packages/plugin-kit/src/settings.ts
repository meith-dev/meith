/**
 * F69 — a plugin's stored state: its settings, and whether the operator has
 * switched it off.
 *
 * Both live in the board's `settings` table, under keys the host builds and a
 * plugin never sees. That table is already read once per request and cached
 * (F08/F10), which is the whole reason this is where they go: a durable
 * per-plugin flag that cost a query would be a query on every page for a value
 * that changes twice a year, and D85 refused exactly that when it left
 * auto-disable in memory.
 *
 * ## Two namespaces that cannot collide, by construction
 *
 * A setting is stored at `plugin.<pluginKey>.<settingKey>` and the enabled flag
 * at `plugin.<pluginKey>._enabled`. Those cannot meet: `definePlugin` requires a
 * setting key to match `^[a-z][a-z0-9_]{1,39}$`, so a key beginning with an
 * underscore is not a key a plugin can declare. The reserved space is a
 * *validated* impossibility rather than a naming convention somebody is trusted
 * to remember — and there is a test that fails if the pattern is ever loosened.
 *
 * ## A stored value that no longer parses is not an error
 *
 * It falls back to the plugin's declared default, exactly as F08 does for board
 * settings and for the same reason: a plugin that tightened a setting's type
 * between versions, or an operator who edited a row by hand, should cost that
 * one setting rather than the board. What a plugin is handed is therefore always
 * the declared shape, so a handler never has to defend against `"true"` arriving
 * where it declared `false`.
 */

import type { PluginDefinition, PluginSetting } from './plugin'

export type PluginSettingValue = string | number | boolean

/** The reserved segment. Unreachable from `definePlugin`'s setting-key pattern. */
const ENABLED_SUFFIX = '_enabled'

/** The stored key for a plugin's operator switch. */
export function pluginEnabledKey(pluginKey: string): string {
  return `plugin.${pluginKey}.${ENABLED_SUFFIX}`
}

/**
 * Serialise a value for the `settings` table.
 *
 * Booleans are `"1"`/`"0"`, matching F08's `serialise` — two encodings of false
 * in one column is how a reader ends up treating `"false"` as truthy.
 */
export function serialisePluginSetting(value: PluginSettingValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

/**
 * Parse stored text back to the type the plugin declared, or `null` if it does
 * not parse.
 *
 * The declared *default* is the type statement, as everywhere else in this
 * codebase — a second field naming the type is a second thing to keep in step
 * with the first.
 *
 * `null` rather than a throw or a silent default, because the two callers want
 * different things from a bad value: resolution wants the default, and the ACP's
 * save wants to tell the operator which field it rejected.
 */
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
    /*
     * `Number('')` is 0 and `Number(' ')` is 0, which would turn an empty field
     * into a deliberate-looking zero. An empty numeric field is a mistake, and
     * saying so beats storing a number nobody typed.
     */
    if (raw.trim() === '') return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  return raw
}

/**
 * A plugin's settings, resolved: every declared key present, defaults filled in.
 *
 * This is what `PluginRuntimeContext.settings` is, and the completeness is the
 * contract — a plugin reading `settings.api_url` gets its declared default on a
 * board that has never configured it, so there is no `?? 'https://…'` in plugin
 * code that could disagree with the manifest the ACP renders.
 */
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

/**
 * The plugins an operator has switched off, read from the same override map.
 *
 * Absence means enabled, which is the same rule `InstalledPlugin.enabled`
 * follows and for the same reason D75 gave: the failure mode of the opposite
 * default is every plugin silently inert with no error anywhere, and "installs
 * cleanly, does nothing" is a symptom nobody thinks to look for.
 *
 * Only `"0"` disables. A row holding anything else is a row this code did not
 * write, and reading an unrecognised value as "off" would let a corrupt string
 * switch a plugin off on every instance at once.
 */
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
