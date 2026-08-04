/**
 * F79 — `definePlugin`, and what a plugin is allowed to be.
 *
 * A plugin is a **module that describes itself**: hooks, settings, migrations,
 * tasks, admin pages, UI contributions, and four lifecycle callbacks. It is
 * imported statically by `forum.config.ts`, like a theme and for the same reason
 * (invariant 6) — a serverless bundle contains only what the bundler saw, so
 * nothing is discovered by scanning a plugins directory at request time.
 *
 * What a plugin is *not*: a place where core behaviour is patched. There is no
 * monkey-patching seam, no `require` interception and no way to replace a domain
 * command. Everything a plugin can do is in the registry, is typed, and is
 * dispatched by a host that catches its failures. That constraint is what makes
 * "a plugin cannot crash a request" a claim rather than a hope.
 *
 * ## Declared, not imperative
 *
 * A plugin does not *call* `registerHook` at import time. It exports an object
 * saying what it wants, and the host reads it. Registration by side effect makes
 * the installed set depend on module evaluation order — which differs between
 * the dev server, a bundled build and the worker — and it is the direct cause of
 * the "works locally, missing in production" class of plugin bug that every PHP
 * board has.
 *
 * The one exception is the lifecycle callbacks, which are functions because they
 * *are* behaviour. They run at explicit moments, one at a time, and their
 * failures are reported rather than thrown at whoever triggered them.
 */

import type { ReactNode } from 'react'

import { isHookName, type HOOKS, type HookName } from './hooks'
import type { HookContext, HookValue } from './payloads'
import { isPluginRegion, type PluginRegion, type PluginRegionContext } from './regions'

/**
 * A filter returns a replacement value; an event's return is discarded.
 *
 * Both may be async. The host awaits them, which is why a slow handler is a slow
 * page and why timing is measured per handler rather than per hook.
 */
export type FilterHandler<K extends HookName> = (
  value: HookValue<K>,
  context: HookContext<K>,
) => HookValue<K> | Promise<HookValue<K>>

export type EventHandler<K extends HookName> = (
  value: HookValue<K>,
  context: HookContext<K>,
) => void | Promise<void>

export type HookHandler<K extends HookName> = (typeof HOOKS)[K]['kind'] extends 'filter'
  ? FilterHandler<K>
  : EventHandler<K>

/**
 * A handler with its ordering weight.
 *
 * `priority` is the *declared* half of the ordering. Lower runs first; the
 * default is 100 so a plugin can insert either side of an unopinionated one
 * without negative numbers. Ties break on plugin key, so the composition of two
 * plugins is fixed no matter which order they were installed in.
 */
export interface HookRegistration<K extends HookName> {
  readonly handler: HookHandler<K>
  readonly priority?: number | undefined
}

export type PluginHooks = {
  readonly [K in HookName]?: HookHandler<K> | HookRegistration<K>
}

/**
 * A setting a plugin declares.
 *
 * The stored key is namespaced by the host (`plugin.<pluginKey>.<key>`), never
 * by the plugin, so two plugins cannot collide and neither can reach a core
 * setting. The kind is derived from the default's type, exactly as F08/F64 do —
 * stating the type as a *value* is the one form of the statement that cannot
 * disagree with the schema.
 */
export interface PluginSetting {
  readonly key: string
  readonly label: string
  readonly description?: string | undefined
  readonly default: string | number | boolean
  /** Hidden behind "advanced" in the ACP. For settings that can lock somebody out. */
  readonly advanced?: boolean | undefined
}

/**
 * One forward migration.
 *
 * Ids are sortable strings (`0001_add_table`), applied in ascending order, and
 * recorded per plugin. Forward-only, like the core migrator and for the same
 * reason (invariant 32): a down migration that drops a column is a data-loss
 * button on a live board.
 *
 * Statements are SQL text rather than a query builder because a plugin must not
 * import `@meith/db` — only the host runs them, inside one transaction per
 * migration, and a plugin that could open its own connection would be outside
 * every guarantee this codebase makes about the database.
 */
export interface PluginMigration {
  readonly id: string
  readonly statements: readonly string[]
}

/**
 * A scheduled task.
 *
 * Registered under `plugin.<pluginKey>.<id>` in F06's registry, run by the same
 * tick, and subject to the same rules: idempotent, catch-up capable, bounded.
 * A task that assumes it runs exactly once every interval is broken on a
 * platform whose cron drifts, which is all of them.
 */
export interface PluginTask {
  readonly id: string
  readonly intervalSeconds: number
  readonly run: (context: PluginRuntimeContext) => Promise<void> | void
}

/** An admin page, mounted under `/admin/plugins/<pluginKey>/<path>`. */
export interface PluginAdminPage {
  readonly path: string
  readonly title: string
  readonly render: (context: PluginRuntimeContext) => ReactNode | Promise<ReactNode>
}

/**
 * A UI contribution: markup in a named region of the board.
 *
 * Regions are *not* theme slots. A theme owns its slots and a plugin must not be
 * able to replace one — that would let an installed plugin decide what a post
 * looks like, and the two would fight. A region is an explicit "plugins may add
 * something here" point that themes render, so the theme keeps control of where
 * plugin output appears and the plugin keeps control of what it is.
 */
export interface PluginContribution {
  readonly region: PluginRegion
  readonly priority?: number | undefined
  readonly render: (context: PluginRegionContext) => ReactNode
}

/** What a lifecycle callback, task or page is handed. */
export interface PluginRuntimeContext {
  /** This plugin's settings, already namespaced and resolved. */
  readonly settings: Readonly<Record<string, string | number | boolean>>
  readonly logger: {
    readonly info: (message: string, detail?: Record<string, unknown>) => void
    readonly warn: (message: string, detail?: Record<string, unknown>) => void
    readonly error: (message: string, detail?: Record<string, unknown>) => void
  }
}

export interface PluginDefinition {
  /** Stable key. Namespaces this plugin's settings, tasks, pages and log lines. */
  readonly key: string
  readonly name: string
  /** The plugin's own version, for its migrations and its ACP row. */
  readonly version: string
  readonly description?: string | undefined
  /** The theme-kit/plugin-kit API major this plugin was written against. */
  readonly apiVersion?: string | undefined

  /**
   * Plugin keys this one needs installed and upgraded first (F84).
   *
   * Declared rather than inferred, because the dependency that matters is
   * usually a *schema* one — a plugin whose table references another's — and
   * nothing in an import graph reveals that. The upgrade planner topologically
   * sorts on this and refuses a cycle; a missing dependency is named rather than
   * silently ignored, since a plugin quietly running against a table that does
   * not exist is the failure this exists to prevent.
   */
  readonly dependsOn?: readonly string[] | undefined

  readonly hooks?: PluginHooks | undefined
  readonly settings?: readonly PluginSetting[] | undefined
  readonly migrations?: readonly PluginMigration[] | undefined
  readonly tasks?: readonly PluginTask[] | undefined
  readonly adminPages?: readonly PluginAdminPage[] | undefined
  readonly contributions?: readonly PluginContribution[] | undefined

  readonly onInstall?: ((context: PluginRuntimeContext) => Promise<void> | void) | undefined
  readonly onEnable?: ((context: PluginRuntimeContext) => Promise<void> | void) | undefined
  readonly onDisable?: ((context: PluginRuntimeContext) => Promise<void> | void) | undefined
  readonly onUninstall?: ((context: PluginRuntimeContext) => Promise<void> | void) | undefined
}

const KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
const SETTING_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/
const MIGRATION_ID_PATTERN = /^\d{4}_[a-z0-9_]{1,60}$/
const TASK_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
const PAGE_PATH_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

/**
 * Validate a manifest and return it typed.
 *
 * The same shape and reasoning as `defineTheme` and `defineForumConfig`: an
 * identity function whose job is to attach the type and to catch the mistakes
 * that would otherwise fail a long way from their cause. Everything here is
 * checked at module load, which on this stack means at build or at boot — never
 * on the request that happens to hit the broken path.
 *
 * The checks, and the failure each prevents:
 *
 *  - **key shape** — the key namespaces settings, tasks, pages and log lines. A
 *    key with a dot in it produces `plugin.a.b.c` and an ambiguous parse; one
 *    with a slash produces an admin route nobody intended.
 *  - **an unknown hook name** — a typo is a handler that never runs, and the
 *    symptom is a plugin that installs cleanly and does nothing. That is the
 *    single most common plugin bug there is, and it is a spelling mistake.
 *  - **a non-function handler** — same class, louder.
 *  - **duplicate setting keys, task ids, migration ids, page paths** — each of
 *    these is a silent overwrite in a `Record` somewhere downstream.
 *  - **migration ids out of order** — they are applied in sort order, so an id
 *    that sorts before one already applied is a migration that never runs on an
 *    upgraded board and does run on a fresh one. Two boards, different schemas,
 *    no error.
 *  - **an unknown region** — a contribution nobody renders.
 *  - **a non-positive task interval** — a task that runs every tick forever.
 */
export function definePlugin(plugin: PluginDefinition): PluginDefinition {
  const where = `definePlugin("${plugin.key}")`

  if (!KEY_PATTERN.test(plugin.key)) {
    throw new Error(
      `definePlugin: "${plugin.key}" is not a valid plugin key. Use lower-case letters, ` +
        'digits and hyphens — it namespaces this plugin’s settings, tasks and admin routes.',
    )
  }
  if (plugin.name.trim() === '') throw new Error(`${where}: name must not be empty.`)
  if (!/^\d+\.\d+\.\d+$/.test(plugin.version)) {
    throw new Error(`${where}: version must be semver (major.minor.patch), got "${plugin.version}".`)
  }

  for (const dependency of plugin.dependsOn ?? []) {
    if (!KEY_PATTERN.test(dependency)) {
      throw new Error(`${where}: "${dependency}" is not a valid plugin key to depend on.`)
    }
    if (dependency === plugin.key) {
      throw new Error(`${where}: a plugin cannot depend on itself.`)
    }
  }

  for (const [name, registration] of Object.entries(plugin.hooks ?? {})) {
    if (!isHookName(name)) {
      throw new Error(
        `${where}: unknown hook "${name}". A misspelled hook is a handler that never ` +
          'runs, which looks exactly like a plugin that installs cleanly and does nothing.',
      )
    }
    const handler =
      typeof registration === 'function' ? registration : (registration as HookRegistration<HookName>)?.handler
    if (typeof handler !== 'function') {
      throw new Error(`${where}: hook "${name}" must be a function or { handler, priority }.`)
    }
  }

  assertUnique(where, 'setting', (plugin.settings ?? []).map((setting) => setting.key))
  for (const setting of plugin.settings ?? []) {
    if (!SETTING_KEY_PATTERN.test(setting.key)) {
      throw new Error(
        `${where}: setting key "${setting.key}" must be lower-case letters, digits and ` +
          'underscores. It becomes plugin.<plugin>.<key> in the settings registry.',
      )
    }
  }

  assertUnique(where, 'migration', (plugin.migrations ?? []).map((migration) => migration.id))
  const migrationIds = (plugin.migrations ?? []).map((migration) => migration.id)
  for (const id of migrationIds) {
    if (!MIGRATION_ID_PATTERN.test(id)) {
      throw new Error(
        `${where}: migration id "${id}" must look like 0001_description. Ids are applied ` +
          'in sort order, so they have to sort the way they were written.',
      )
    }
  }
  const sorted = [...migrationIds].sort()
  if (migrationIds.some((id, index) => id !== sorted[index])) {
    throw new Error(
      `${where}: migrations are not in ascending id order (${migrationIds.join(', ')}). ` +
        'They are applied in sort order, so a list that reads differently from the order ' +
        'it runs in is a schema that differs between a fresh board and an upgraded one.',
    )
  }
  for (const migration of plugin.migrations ?? []) {
    if (migration.statements.length === 0) {
      throw new Error(`${where}: migration "${migration.id}" has no statements.`)
    }
  }

  assertUnique(where, 'task', (plugin.tasks ?? []).map((task) => task.id))
  for (const task of plugin.tasks ?? []) {
    if (!TASK_ID_PATTERN.test(task.id)) {
      throw new Error(`${where}: task id "${task.id}" must be lower-case letters, digits and hyphens.`)
    }
    if (!Number.isInteger(task.intervalSeconds) || task.intervalSeconds < 60) {
      throw new Error(
        `${where}: task "${task.id}" has an interval of ${task.intervalSeconds}s. The tick ` +
          'is minute-granular at best on a serverless platform; anything under 60s is a ' +
          'task that claims a frequency the scheduler cannot deliver.',
      )
    }
  }

  assertUnique(where, 'admin page', (plugin.adminPages ?? []).map((page) => page.path))
  for (const page of plugin.adminPages ?? []) {
    if (!PAGE_PATH_PATTERN.test(page.path)) {
      throw new Error(
        `${where}: admin page path "${page.path}" must be a single lower-case segment. ` +
          'Pages are mounted under /admin/plugins/<plugin>/<path>; a slash here would ' +
          'escape that prefix.',
      )
    }
  }

  for (const contribution of plugin.contributions ?? []) {
    if (!isPluginRegion(contribution.region)) {
      throw new Error(`${where}: unknown UI region "${contribution.region}".`)
    }
    if (typeof contribution.render !== 'function') {
      throw new Error(`${where}: contribution to "${contribution.region}" needs a render function.`)
    }
  }

  return plugin
}

function assertUnique(where: string, kind: string, values: readonly string[]): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index)
  if (duplicate !== undefined) {
    throw new Error(`${where}: ${kind} "${duplicate}" is declared twice.`)
  }
}

/** The stored key for a plugin's setting. One place, so nothing hand-builds it. */
export function pluginSettingKey(pluginKey: string, settingKey: string): string {
  return `plugin.${pluginKey}.${settingKey}`
}

/** The registered id for a plugin's task. */
export function pluginTaskId(pluginKey: string, taskId: string): string {
  return `plugin.${pluginKey}.${taskId}`
}

/** The route for a plugin's admin page. */
export function pluginAdminPath(pluginKey: string, path: string): string {
  return `/admin/plugins/${pluginKey}${path === '' ? '' : `/${path}`}`
}
