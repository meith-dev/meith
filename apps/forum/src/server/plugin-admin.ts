import 'server-only'

import { env, logger } from '@meith/core'
import { appliedPluginMigrations, getDb } from '@meith/db'
import {
  pluginAdminPath,
  pluginTaskId,
  resolvePluginSettings,
  type PluginDefinition,
  type PluginHealth,
  type PluginSettingValue,
} from '@meith/plugin-kit'

import forumConfig from '../../forum.config'
import { configuredPlugins, pluginHost } from './plugin-host'
import { getSettingOverrides } from './settings'

export type PluginSettingKind = 'string' | 'number' | 'boolean'

export interface PluginSettingRow {
  readonly key: string
  readonly label: string
  readonly description: string | null
  readonly advanced: boolean
  readonly kind: PluginSettingKind
  readonly default: PluginSettingValue
  readonly value: PluginSettingValue
  readonly overridden: boolean
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

function definitionsByKey(): ReadonlyMap<string, PluginDefinition | undefined> {
  return new Map(
    (forumConfig.plugins ?? []).map((entry) => [entry.key, entry.plugin as PluginDefinition | undefined]),
  )
}

function settingKind(value: PluginSettingValue): PluginSettingKind {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'string'
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

export async function pluginInventory(): Promise<PluginInventory> {
  const definitions = definitionsByKey()
  const overrides = await getSettingOverrides()
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
    const resolved = definition === undefined ? {} : resolvePluginSettings(definition, overrides)

    return {
      key: entry.key,
      name: entry.name,
      version: entry.version,
      description: definition?.description ?? null,
      dependsOn: definition?.dependsOn ?? [],
      hasDefinition: entry.hasDefinition,

      configuredEnabled,
      operatorEnabled,
      running: configuredEnabled && operatorEnabled && (entryHealth?.enabled ?? false),

      health: entryHealth,
      hooks: Object.keys(definition?.hooks ?? {}).sort(),
      regions: [...new Set((definition?.contributions ?? []).map((c) => c.region))].sort(),

      settings: (definition?.settings ?? []).map((setting): PluginSettingRow => ({
        key: setting.key,
        label: setting.label,
        description: setting.description ?? null,
        advanced: setting.advanced === true,
        kind: settingKind(setting.default),
        default: setting.default,
        value: resolved[setting.key] ?? setting.default,
        overridden: overrides.has(`plugin.${entry.key}.${setting.key}`),
      })),

      migrations: (definition?.migrations ?? []).map((migration): PluginMigrationRow => ({
        id: migration.id,
        applied: (applied?.get(entry.key) ?? []).includes(migration.id),
      })),

      tasks: (definition?.tasks ?? []).map((task): PluginTaskRow => ({
        id: task.id,
        registeredId: pluginTaskId(entry.key, task.id),
        intervalSeconds: task.intervalSeconds,
      })),

      pages: (definition?.adminPages ?? []).map((page): PluginPageRow => ({
        path: page.path,
        title: page.title,
        href: pluginAdminPath(entry.key, page.path),
      })),
    }
  })

  return { plugins, migrationsKnown: withMigrations.length === 0 || applied !== null }
}

export async function pluginRow(key: string): Promise<PluginRow | null> {
  const inventory = await pluginInventory()
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
