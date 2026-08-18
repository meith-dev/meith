import 'server-only'

import { env, logger, readPluginEnv } from '@meith/core'
import { appliedPluginMigrations, getDb } from '@meith/db'
import type { Translator } from '@meith/i18n'
import {
  type PluginDefinition,
  type PluginHealth,
  type PluginSettingSource,
  type PluginSettingType,
  type PluginSettingValue,
  pluginAdminPath,
  pluginSettingType,
  pluginTaskId,
  resolvePluginSettingDetails,
} from '@meith/plugin-kit'

import forumConfig from '../../community.config'
import { configuredPlugins, pluginHost, syncOperatorDisables } from './plugin-host'
import { getSettingOverrides } from './settings'

export type PluginSettingKind = PluginSettingType

export interface PluginSettingRow {
  readonly key: string
  readonly label: string
  readonly description: string | null
  readonly advanced: boolean
  readonly kind: PluginSettingKind
  /** '' for a secret, whatever is stored or not: the value never leaves the server. */
  readonly default: PluginSettingValue
  readonly value: PluginSettingValue
  readonly overridden: boolean
  readonly source: PluginSettingSource
  /** For secrets: whether a non-empty value is in force, without saying what it is. */
  readonly set: boolean
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly envName: string | null
  readonly problem: string | null
}

export interface PluginMigrationRow {
  readonly id: string
  readonly applied: boolean
}

export interface PluginTaskRow {
  readonly id: string
  readonly registeredId: string
  readonly intervalSeconds: number
}

export interface PluginPageRow {
  readonly path: string
  readonly title: string
  readonly href: string
}

export interface PluginRow {
  readonly key: string
  readonly name: string | null
  readonly version: string | null
  readonly description: string | null
  readonly dependsOn: readonly string[]
  readonly hasDefinition: boolean

  readonly configuredEnabled: boolean
  readonly operatorEnabled: boolean
  readonly running: boolean

  readonly health: PluginHealth | null
  readonly hooks: readonly string[]
  readonly regions: readonly string[]
  readonly settings: readonly PluginSettingRow[]
  readonly migrations: readonly PluginMigrationRow[]
  readonly tasks: readonly PluginTaskRow[]
  readonly pages: readonly PluginPageRow[]
}

export interface PluginInventory {
  readonly plugins: readonly PluginRow[]
  readonly migrationsKnown: boolean
}

function translated(
  t: Translator | undefined,
  key: string | undefined,
  fallback: string,
  args?: Parameters<Translator['t']>[1],
): string {
  return t !== undefined && key !== undefined && t.has(key) ? t.t(key, args) : fallback
}

function definitionsByKey(): ReadonlyMap<string, PluginDefinition | undefined> {
  return new Map(
    (forumConfig.plugins ?? []).map((entry) => [
      entry.key,
      entry.plugin as PluginDefinition | undefined,
    ]),
  )
}

async function appliedByPlugin(
  keys: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]> | null> {
  if (keys.length === 0) return new Map()
  if (env.DATA_SOURCE !== 'postgres') return null

  try {
    const db = getDb()
    const applied = new Map<string, readonly string[]>()
    for (const key of keys) {
      applied.set(key, await appliedPluginMigrations(db, key))
    }
    return applied
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read applied plugin migrations')
    return null
  }
}

export async function pluginInventory(t?: Translator): Promise<PluginInventory> {
  const definitions = definitionsByKey()
  const overrides = await getSettingOverrides()
  await syncOperatorDisables()
  const health = new Map(pluginHost.health().map((entry) => [entry.key, entry]))

  const withMigrations = [...definitions]
    .filter(([, definition]) => (definition?.migrations ?? []).length > 0)
    .map(([key]) => key)
  const applied = await appliedByPlugin(withMigrations)

  const plugins = configuredPlugins().map((entry): PluginRow => {
    const definition = definitions.get(entry.key)
    const configuredEnabled = entry.enabled
    const operatorEnabled = overrides.get(`plugin.${entry.key}._enabled`) !== '0'
    const entryHealth = health.get(entry.key) ?? null
    const details =
      definition === undefined
        ? []
        : resolvePluginSettingDetails(definition, overrides, readPluginEnv)

    return {
      key: entry.key,
      name:
        definition === undefined
          ? entry.name
          : translated(t, definition.nameKey, entry.name ?? definition.name),
      version: entry.version,
      description:
        definition?.description === undefined
          ? null
          : translated(
              t,
              definition.descriptionKey,
              definition.description,
              definition.descriptionArgs,
            ),
      dependsOn: definition?.dependsOn ?? [],
      hasDefinition: entry.hasDefinition,

      configuredEnabled,
      operatorEnabled,
      running: configuredEnabled && operatorEnabled && (entryHealth?.enabled ?? false),

      health: entryHealth,
      hooks: Object.keys(definition?.hooks ?? {}).sort(),
      regions: [...new Set((definition?.contributions ?? []).map((c) => c.region))].sort(),

      settings: details.map(({ setting, value, source, problem }): PluginSettingRow => {
        const kind = pluginSettingType(setting)
        const secret = kind === 'secret'
        return {
          key: setting.key,
          label: translated(t, setting.labelKey, setting.label),
          description:
            setting.description === undefined
              ? null
              : translated(t, setting.descriptionKey, setting.description),
          advanced: setting.advanced === true,
          kind,
          default: secret ? '' : setting.default,
          value: secret ? '' : value,
          overridden: overrides.has(`plugin.${entry.key}.${setting.key}`),
          source,
          set: typeof value === 'string' ? value !== '' : true,
          options: (setting.options ?? []).map((option) => ({
            value: option.value,
            label: translated(t, option.labelKey, option.label),
          })),
          envName: setting.env ?? null,
          problem,
        }
      }),

      migrations: (definition?.migrations ?? []).map(
        (migration): PluginMigrationRow => ({
          id: migration.id,
          applied: (applied?.get(entry.key) ?? []).includes(migration.id),
        }),
      ),

      tasks: (definition?.tasks ?? []).map(
        (task): PluginTaskRow => ({
          id: task.id,
          registeredId: pluginTaskId(entry.key, task.id),
          intervalSeconds: task.intervalSeconds,
        }),
      ),

      pages: (definition?.adminPages ?? []).map(
        (page): PluginPageRow => ({
          path: page.path,
          title: translated(t, page.titleKey, page.title, page.titleArgs),
          href: pluginAdminPath(entry.key, page.path),
        }),
      ),
    }
  })

  return { plugins, migrationsKnown: withMigrations.length === 0 || applied !== null }
}

export async function pluginRow(key: string, t?: Translator): Promise<PluginRow | null> {
  const inventory = await pluginInventory(t)
  return inventory.plugins.find((plugin) => plugin.key === key) ?? null
}

export interface HookListenerRow {
  readonly hook: string
  readonly plugins: readonly string[]
}

export function hookListeners(): readonly HookListenerRow[] {
  return Object.entries(pluginHost.listeners())
    .filter(([, plugins]) => plugins.length > 0)
    .map(([hook, plugins]) => ({ hook, plugins }))
    .sort((a, b) => (a.hook < b.hook ? -1 : a.hook > b.hook ? 1 : 0))
}
