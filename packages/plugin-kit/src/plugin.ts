import type { ReactNode } from 'react'

import { type HOOKS, type HookName, isHookName } from './hooks'
import type { HookContext, HookValue } from './payloads'
import { isPluginRegion, type PluginRegion, type PluginRegionContext } from './regions'
import type { PluginData, PluginGrants, PluginNotify, PluginUsers } from './runtime'

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

export type PluginSettingType = 'string' | 'secret' | 'number' | 'boolean' | 'select'

export interface PluginSetting {
  readonly key: string
  readonly label: string
  readonly description?: string | undefined
  readonly type?: PluginSettingType | undefined
  readonly options?: readonly { readonly value: string; readonly label: string }[] | undefined
  readonly env?: string | undefined
  readonly required?: boolean | undefined
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
  readonly render: (context: PluginAdminPageContext) => ReactNode | Promise<ReactNode>
}

export interface PluginContribution {
  readonly region: PluginRegion
  readonly priority?: number | undefined
  readonly render: (context: PluginRegionContext) => ReactNode
}

export interface PluginViewer {
  readonly userId: number | null
  readonly isGuest: boolean
}

export interface PluginRequest {
  readonly viewer: PluginViewer
  readonly method: 'GET' | 'POST'
  readonly path: string
  readonly query: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly rawBody: Uint8Array | null
  readonly form: Readonly<Record<string, string>> | null
  readonly json: unknown
  readonly boardUrl: string
}

export type PluginResponse =
  | { readonly kind: 'json'; readonly status?: number | undefined; readonly body: unknown }
  | {
      readonly kind: 'text'
      readonly status?: number | undefined
      readonly body: string
      readonly contentType?: string | undefined
    }
  | { readonly kind: 'redirect'; readonly to: string }

export type PluginRouteAccess = 'anonymous' | 'member' | 'admin'
export type PluginPageAccess = 'anonymous' | 'member'

export interface PluginRouteRateLimit {
  readonly limit: number
  readonly windowSeconds: number
}

export interface PluginRoute {
  readonly path: string
  readonly method: 'GET' | 'POST'
  readonly access: PluginRouteAccess
  readonly rawBody?: boolean | undefined
  readonly maxBodyBytes?: number | undefined
  readonly rateLimit?: PluginRouteRateLimit | undefined
  readonly handler: (
    request: PluginRequest,
    context: PluginRuntimeContext,
  ) => Promise<PluginResponse> | PluginResponse
}

export interface PluginPageContext extends PluginRuntimeContext {
  readonly viewer: PluginViewer
  readonly path: string
  readonly query: Readonly<Record<string, string>>
  readonly boardUrl: string
  readonly locale: string
}

export interface PluginAdminPageContext extends PluginRuntimeContext {
  readonly query: Readonly<Record<string, string>>
  readonly locale: string
}

export interface PluginBoardPage {
  readonly path: string
  readonly title: string
  readonly access: PluginPageAccess
  readonly render: (context: PluginPageContext) => ReactNode | Promise<ReactNode>
}

export interface PluginRuntimeContext {
  readonly settings: Readonly<Record<string, string | number | boolean>>
  readonly logger: {
    readonly info: (message: string, detail?: Record<string, unknown>) => void
    readonly warn: (message: string, detail?: Record<string, unknown>) => void
    readonly error: (message: string, detail?: Record<string, unknown>) => void
  }
  readonly grants: PluginGrants
  readonly data: PluginData
  readonly users: PluginUsers
  readonly notify: PluginNotify
}

export interface PluginNotificationKind {
  readonly key: string
  readonly title: string
  readonly description: string
  readonly emailByDefault?: boolean | undefined
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
  readonly routes?: readonly PluginRoute[] | undefined
  readonly pages?: readonly PluginBoardPage[] | undefined
  readonly notifications?: readonly PluginNotificationKind[] | undefined
  readonly allowedRedirectHosts?: readonly string[] | undefined

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
const ROUTE_PATH_PATTERN = /^[a-z][a-z0-9-]{0,39}(\/[a-z0-9-]{1,40}){0,3}$/
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/
const REDIRECT_HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export const MAX_ROUTE_BODY_BYTES = 1_048_576
export const DEFAULT_ROUTE_BODY_BYTES = 65_536

export function pluginTablePrefix(pluginKey: string): string {
  return `plugin_${pluginKey.replace(/-/g, '_')}_`
}

const MIGRATION_FORMS: readonly {
  readonly pattern: RegExp
  readonly describe: string
}[] = [
  { pattern: /^create\s+table(?:\s+if\s+not\s+exists)?\s+(\S+)/i, describe: 'create table' },
  { pattern: /^alter\s+table(?:\s+if\s+exists)?(?:\s+only)?\s+(\S+)/i, describe: 'alter table' },
  { pattern: /^drop\s+table(?:\s+if\s+exists)?\s+(\S+)/i, describe: 'drop table' },
  {
    pattern: /^create\s+(?:unique\s+)?index(?:\s+if\s+not\s+exists)?\s+(\S+)\s+on\s+(\S+)/i,
    describe: 'create index',
  },
  { pattern: /^drop\s+index(?:\s+if\s+exists)?\s+(\S+)/i, describe: 'drop index' },
  { pattern: /^create\s+sequence(?:\s+if\s+not\s+exists)?\s+(\S+)/i, describe: 'create sequence' },
  { pattern: /^create\s+(?:or\s+replace\s+)?view\s+(\S+)/i, describe: 'create view' },
  { pattern: /^insert\s+into\s+(\S+)/i, describe: 'insert into' },
  { pattern: /^update\s+(\S+)/i, describe: 'update' },
  { pattern: /^delete\s+from\s+(\S+)/i, describe: 'delete from' },
  { pattern: /^truncate(?:\s+table)?\s+(\S+)/i, describe: 'truncate' },
  { pattern: /^comment\s+on\s+(?:table|column|index|view)\s+(\S+)/i, describe: 'comment on' },
]

function bareIdentifier(raw: string): string {
  let name = raw
    .replace(/[(;,].*$/s, '')
    .replace(/"/g, '')
    .toLowerCase()
  if (name.startsWith('public.')) name = name.slice('public.'.length)
  const dot = name.indexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

function assertMigrationStatement(where: string, prefix: string, statement: string): void {
  const trimmed = statement.trim()

  const form = MIGRATION_FORMS.map((candidate) => ({
    candidate,
    match: trimmed.match(candidate.pattern),
  })).find((entry) => entry.match !== null)

  if (form === undefined || form.match === null) {
    throw new Error(
      `${where}: migration statement "${trimmed.slice(0, 60)}…" is not a form plugin ` +
        `migrations may use. Migrations create and fill this plugin's own ${prefix}* ` +
        'objects; anything else belongs to core or to a query at runtime.',
    )
  }

  for (const raw of form.match.slice(1)) {
    const name = bareIdentifier(raw)
    if (!name.startsWith(prefix)) {
      throw new Error(
        `${where}: ${form.candidate.describe} "${name}" is outside this plugin's namespace. ` +
          `Every object a plugin's migrations touch must be named ${prefix}* — that is what ` +
          'lets two plugins coexist and keeps either out of the board’s own tables.',
      )
    }
  }

  for (const match of trimmed.matchAll(/references\s+(\S+)/gi)) {
    const target = bareIdentifier(match[1] as string)
    if (!target.startsWith(prefix)) {
      throw new Error(
        `${where}: a foreign key to "${target}" reaches outside this plugin's namespace. ` +
          'Store the id as a plain column instead — a plugin table must not couple itself ' +
          'to the board’s schema.',
      )
    }
  }
}

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
    throw new Error(
      `${where}: version must be semver (major.minor.patch), got "${plugin.version}".`,
    )
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
      typeof registration === 'function'
        ? registration
        : (registration as HookRegistration<HookName>)?.handler
    if (typeof handler !== 'function') {
      throw new Error(`${where}: hook "${name}" must be a function or { handler, priority }.`)
    }
  }

  assertUnique(
    where,
    'setting',
    (plugin.settings ?? []).map((setting) => setting.key),
  )
  for (const setting of plugin.settings ?? []) {
    if (!SETTING_KEY_PATTERN.test(setting.key)) {
      throw new Error(
        `${where}: setting key "${setting.key}" must be lower-case letters, digits and ` +
          'underscores. It becomes plugin.<plugin>.<key> in the settings registry.',
      )
    }

    const declared = setting.type
    if (declared !== undefined) {
      const expected: PluginSettingType[] =
        typeof setting.default === 'boolean'
          ? ['boolean']
          : typeof setting.default === 'number'
            ? ['number']
            : ['string', 'secret', 'select']
      if (!expected.includes(declared)) {
        throw new Error(
          `${where}: setting "${setting.key}" declares type "${declared}" but its default is ` +
            `a ${typeof setting.default}. The default is what an unset board runs on; the two ` +
            'cannot disagree.',
        )
      }
    }

    if (declared === 'secret' && setting.default !== '') {
      throw new Error(
        `${where}: secret setting "${setting.key}" must default to "". A shipped secret is ` +
          'not a secret, and a working fallback credential is a credential in the repository.',
      )
    }

    if (declared === 'select') {
      const options = setting.options ?? []
      if (options.length === 0) {
        throw new Error(`${where}: select setting "${setting.key}" needs options.`)
      }
      if (!options.some((option) => option.value === setting.default)) {
        throw new Error(
          `${where}: select setting "${setting.key}" defaults to "${String(setting.default)}", ` +
            'which is not one of its options.',
        )
      }
    }

    if (setting.env !== undefined && !ENV_NAME_PATTERN.test(setting.env)) {
      throw new Error(
        `${where}: setting "${setting.key}" names the environment variable "${setting.env}". ` +
          'Use upper-case letters, digits and underscores, like DUES_STRIPE_SECRET_KEY.',
      )
    }
  }

  assertUnique(
    where,
    'migration',
    (plugin.migrations ?? []).map((migration) => migration.id),
  )
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
    for (const statement of migration.statements) {
      assertMigrationStatement(
        `${where}, migration "${migration.id}"`,
        pluginTablePrefix(plugin.key),
        statement,
      )
    }
  }

  assertUnique(
    where,
    'task',
    (plugin.tasks ?? []).map((task) => task.id),
  )
  for (const task of plugin.tasks ?? []) {
    if (!TASK_ID_PATTERN.test(task.id)) {
      throw new Error(
        `${where}: task id "${task.id}" must be lower-case letters, digits and hyphens.`,
      )
    }
    if (!Number.isInteger(task.intervalSeconds) || task.intervalSeconds < 60) {
      throw new Error(
        `${where}: task "${task.id}" has an interval of ${task.intervalSeconds}s. The tick ` +
          'is minute-granular at best on a serverless platform; anything under 60s is a ' +
          'task that claims a frequency the scheduler cannot deliver.',
      )
    }
  }

  assertUnique(
    where,
    'admin page',
    (plugin.adminPages ?? []).map((page) => page.path),
  )
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

  assertUnique(
    where,
    'route',
    (plugin.routes ?? []).map((route) => `${route.method} ${route.path}`),
  )
  for (const route of plugin.routes ?? []) {
    if (!ROUTE_PATH_PATTERN.test(route.path)) {
      throw new Error(
        `${where}: route path "${route.path}" must be one to four lower-case segments, ` +
          'like "checkout" or "hook/stripe". Routes are mounted under ' +
          '/api/plugins/<plugin>/<path>; anything else would escape that prefix.',
      )
    }
    if (route.method !== 'GET' && route.method !== 'POST') {
      throw new Error(`${where}: route "${route.path}" method must be GET or POST.`)
    }
    if (route.access !== 'anonymous' && route.access !== 'member' && route.access !== 'admin') {
      throw new Error(
        `${where}: route "${route.path}" access must be "anonymous", "member" or "admin".`,
      )
    }
    if (typeof route.handler !== 'function') {
      throw new Error(`${where}: route "${route.path}" needs a handler function.`)
    }
    if (route.maxBodyBytes !== undefined) {
      if (
        !Number.isInteger(route.maxBodyBytes) ||
        route.maxBodyBytes < 1 ||
        route.maxBodyBytes > MAX_ROUTE_BODY_BYTES
      ) {
        throw new Error(
          `${where}: route "${route.path}" maxBodyBytes must be between 1 and ` +
            `${MAX_ROUTE_BODY_BYTES}. A bigger payload belongs in an attachment, not a route body.`,
        )
      }
    }
    if (route.rateLimit !== undefined) {
      const { limit, windowSeconds } = route.rateLimit
      if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
        throw new Error(
          `${where}: route "${route.path}" rateLimit.limit must be a whole number ` +
            'between 1 and 10000.',
        )
      }
      if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 3_600) {
        throw new Error(
          `${where}: route "${route.path}" rateLimit.windowSeconds must be a whole ` +
            'number of seconds, up to an hour.',
        )
      }
    }
  }

  assertUnique(
    where,
    'page',
    (plugin.pages ?? []).map((page) => page.path),
  )
  for (const page of plugin.pages ?? []) {
    if (page.path !== '' && !PAGE_PATH_PATTERN.test(page.path)) {
      throw new Error(
        `${where}: page path "${page.path}" must be empty (the plugin's index page) or a ` +
          'single lower-case segment. Pages are mounted under /plugins/<plugin>/<path>.',
      )
    }
    if (page.title.trim() === '') {
      throw new Error(`${where}: the page at "${page.path}" needs a title.`)
    }
    if (page.access !== 'anonymous' && page.access !== 'member') {
      throw new Error(`${where}: page "${page.path}" access must be "anonymous" or "member".`)
    }
    if (typeof page.render !== 'function') {
      throw new Error(`${where}: page "${page.path}" needs a render function.`)
    }
  }

  assertUnique(
    where,
    'notification kind',
    (plugin.notifications ?? []).map((kind) => kind.key),
  )
  for (const kind of plugin.notifications ?? []) {
    if (!SETTING_KEY_PATTERN.test(kind.key)) {
      throw new Error(
        `${where}: notification kind "${kind.key}" must be lower-case letters, digits ` +
          'and underscores. It becomes plugin.<plugin>.<kind> in the registry, and a ' +
          'line on every member’s notification preferences screen.',
      )
    }
    if (kind.title.trim() === '' || kind.description.trim() === '') {
      throw new Error(
        `${where}: notification kind "${kind.key}" needs a title and a description — ` +
          'they are what the member reads when deciding whether to get emails for it.',
      )
    }
  }

  assertUnique(where, 'redirect host', plugin.allowedRedirectHosts ?? [])
  for (const host of plugin.allowedRedirectHosts ?? []) {
    if (!REDIRECT_HOST_PATTERN.test(host)) {
      throw new Error(
        `${where}: "${host}" is not a plain host name. List bare hosts like ` +
          '"checkout.stripe.com" — no scheme, no path, no port.',
      )
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

export function pluginNotificationKindId(pluginKey: string, kindKey: string): string {
  return `plugin.${pluginKey}.${kindKey}`
}

export function pluginTaskId(pluginKey: string, taskId: string): string {
  return `plugin.${pluginKey}.${taskId}`
}

export function pluginAdminPath(pluginKey: string, path: string): string {
  return `/admin/plugins/${pluginKey}${path === '' ? '' : `/${path}`}`
}

export function pluginRoutePath(pluginKey: string, path: string): string {
  return `/api/plugins/${pluginKey}/${path}`
}

export function pluginAdminRoutePath(pluginKey: string, path: string): string {
  return `/admin/api/plugins/${pluginKey}/${path}`
}

export function pluginPagePath(pluginKey: string, path: string): string {
  return `/plugins/${pluginKey}${path === '' ? '' : `/${path}`}`
}
