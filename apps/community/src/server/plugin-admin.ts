import 'server-only'

/**
 * F69 — everything the plugin screens need, read once.
 *
 * The row a plugin gets in the panel is assembled from four places that
 * disagree with each other for real reasons, and keeping them apart is most of
 * this module's job:
 *
 *  - **`community.config.ts`** — what this build contains. Changing it is a deploy.
 *  - **the `settings` table** — the operator's durable switch and the plugin's
 *    configured values. Changing it is a form submission.
 *  - **`plugin_migrations`** — what has actually been applied to this database.
 *    Changing it is `community upgrade`.
 *  - **the host's counters** — what has happened in *this instance* since it
 *    started. Nothing changes it; it is an observation.
 *
 * A screen that collapsed those into one "enabled" column would be lying about
 * at least three of them. So a plugin can be configured-in but switched off,
 * switched on but auto-disabled for failing, or running fine with a migration
 * that has never been applied — and each of those has a different thing to do
 * about it.
 *
 * ## One query, and only when there is something to ask about
 *
 * Settings come from the request's existing cached read (see `settings.ts`), so
 * they are free. Applied migrations are a real query, and it is skipped
 * entirely on a board whose plugins declare no migrations — which is every
 * board that has not installed one, i.e. the common case.
 */
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

import forumConfig from '../../community.config'
import { configuredPlugins, pluginHost } from './plugin-host'
import { getSettingOverrides } from './settings'

/** How a setting is rendered: derived from the default's type, never declared. */
export type PluginSettingKind = 'string' | 'number' | 'boolean'

export interface PluginSettingRow {
  readonly key: string
  readonly label: string
  readonly description: string | null
  readonly advanced: boolean
  readonly kind: PluginSettingKind
  readonly default: PluginSettingValue
  /** The resolved value: the stored override, or the default. */
  readonly value: PluginSettingValue
  /** True when a row exists for it, so the screen can offer to reset it. */
  readonly overridden: boolean
}

export interface PluginMigrationRow {
  readonly id: string
  readonly applied: boolean
}

export interface PluginTaskRow {
  readonly id: string
  /** What F06's registry knows it as. */
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
  /** An entry naming a key but registering no definition. */
  readonly hasDefinition: boolean

  /** `community.config.ts`. Only a deploy changes this. */
  readonly configuredEnabled: boolean
  /** The ACP's durable switch. `true` unless an administrator turned it off. */
  readonly operatorEnabled: boolean
  /** Both of the above, and the host has not auto-disabled it. */
  readonly running: boolean

  /** `null` for a plugin the host never received — disabled in the config. */
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
  /**
   * False when the applied-migration state could not be read — fixture mode, or
   * a board whose `plugin_migrations` table predates F84.
   *
   * Carried rather than swallowed, because "no migrations are pending" and "we
   * could not find out" must not render the same. The first is a board that is
   * fine; the second is a board that might not be.
   */
  readonly migrationsKnown: boolean
}

/**
 * Every configured plugin's *manifest*, keyed — including disabled ones.
 *
 * The other half of a row — key, enabled, name, version — comes from
 * `configuredPlugins()` rather than from a second walk of the same array, so
 * "absent means enabled" is stated once and has one test. This function exists
 * because `ConfiguredPlugin` deliberately does not carry the definition: it is
 * the shape every other reader wants, and only this screen needs the settings,
 * migrations and pages hanging off it.
 */
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

/**
 * Which of each plugin's migrations have run.
 *
 * Returns `null` — not an empty map — when the answer is unavailable, so the
 * caller can say so rather than reporting every migration as pending. Telling
 * an operator their plugin has four unapplied migrations because the query
 * failed is how somebody runs an upgrade they did not need.
 */
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

/**
 * The whole inventory.
 *
 * Disabled plugins are included and marked, which is the difference between
 * this and `activeDefinitions()`: the host is only told about plugins it may
 * call, and the panel is the one place that has to show what is *not* running.
 */
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
      /*
       * The host is the authority on the third clause and cannot be second-
       * guessed here: `entryHealth.enabled` already folds in both the operator
       * switch and the failure counter, so re-deriving it would be a second
       * opinion that drifts.
       */
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

/** One plugin, or `null` for a key this build does not have. */
export async function pluginRow(key: string): Promise<PluginRow | null> {
  const inventory = await pluginInventory()
  return inventory.plugins.find((plugin) => plugin.key === key) ?? null
}

export interface HookListenerRow {
  readonly hook: string
  readonly plugins: readonly string[]
}

/**
 * Which hooks anything is listening on, in the order they will run.
 *
 * Deliberately *not* every hook in the registry. The generated reference
 * (`docs/plugin-hooks.md`) is where all ninety-one live, and reproducing it in
 * the panel would bury the four lines an operator is actually looking for —
 * which are the ones something is attached to.
 *
 * The order within a hook is the host's own, priority then plugin key, so this
 * is also the answer to "which plugin wins" for two plugins filtering the same
 * value.
 */
export function hookListeners(): readonly HookListenerRow[] {
  return Object.entries(pluginHost.listeners())
    .filter(([, plugins]) => plugins.length > 0)
    .map(([hook, plugins]) => ({ hook, plugins }))
    .sort((a, b) => (a.hook < b.hook ? -1 : a.hook > b.hook ? 1 : 0))
}
