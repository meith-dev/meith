import type { ReactNode } from 'react'

import { isHookName, type HOOKS, type HookName } from './hooks'
import type { HookContext, HookValue } from './payloads'
import { isPluginRegion, type PluginRegion, type PluginRegionContext } from './regions'
import type { PluginGrants } from './runtime'

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

export interface HookRegistration<K extends HookName> {
  readonly handler: HookHandler<K>
  readonly priority?: number | undefined
}

export type PluginHooks = {
  readonly [K in HookName]?: HookHandler<K> | HookRegistration<K>
}

export interface PluginSetting {
  readonly key: string
  readonly label: string
  readonly description?: string | undefined
  readonly default: string | number | boolean
  readonly advanced?: boolean | undefined
}

export interface PluginMigration {
  readonly id: string
  readonly statements: readonly string[]
}

export interface PluginTask {
  readonly id: string
  readonly intervalSeconds: number
  readonly run: (context: PluginRuntimeContext) => Promise<void> | void
}

export interface PluginAdminPage {
  readonly path: string
  readonly title: string
  readonly render: (context: PluginRuntimeContext) => ReactNode | Promise<ReactNode>
}

export interface PluginContribution {
  readonly region: PluginRegion
  readonly priority?: number | undefined
  readonly render: (context: PluginRegionContext) => ReactNode
}

export interface PluginRuntimeContext {
  readonly settings: Readonly<Record<string, string | number | boolean>>
  readonly logger: {
    readonly info: (message: string, detail?: Record<string, unknown>) => void
    readonly warn: (message: string, detail?: Record<string, unknown>) => void
    readonly error: (message: string, detail?: Record<string, unknown>) => void
  }
  readonly grants: PluginGrants
}

export interface PluginDefinition {
  readonly key: string
  readonly name: string
  readonly version: string
  readonly description?: string | undefined
  readonly apiVersion?: string | undefined

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

export function pluginSettingKey(pluginKey: string, settingKey: string): string {
  return `plugin.${pluginKey}.${settingKey}`
}

export function pluginTaskId(pluginKey: string, taskId: string): string {
  return `plugin.${pluginKey}.${taskId}`
}

export function pluginAdminPath(pluginKey: string, path: string): string {
  return `/admin/plugins/${pluginKey}${path === '' ? '' : `/${path}`}`
}
