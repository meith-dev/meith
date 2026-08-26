import { logger, readPluginEnv } from '@meith/core'
import {
  type Database,
  PostgresNotificationRepository,
  PostgresSettingsRepository,
  pluginData,
  pluginGrants,
  pluginUsers,
} from '@meith/db'
import { NotificationService } from '@meith/notifications'
import {
  type PluginDefinition,
  type PluginRuntimeContext,
  pluginNotificationKindSpecs,
  pluginNotify,
  resolvePluginSettings,
} from '@meith/plugin-kit'

export const PLUGIN_STATEMENT_TIMEOUT_MS = 30_000

export async function pluginRuntimeContext(input: {
  readonly db: Database
  readonly plugin: PluginDefinition
  readonly component: string
  readonly overrides?: ReadonlyMap<string, string>
  readonly statementTimeoutMs?: number
}): Promise<PluginRuntimeContext> {
  const overrides = input.overrides ?? (await new PostgresSettingsRepository(input.db).loadAll())
  const log = logger({ component: input.component, plugin: input.plugin.key })

  const notifications = new NotificationService({
    notifications: new PostgresNotificationRepository(input.db),
    extraKinds: pluginNotificationKindSpecs(input.plugin.key, input.plugin.notifications ?? []),
  })

  return {
    settings: resolvePluginSettings(input.plugin, overrides, readPluginEnv),
    logger: {
      info: (message, detail) => log.info(detail ?? {}, message),
      warn: (message, detail) => log.warn(detail ?? {}, message),
      error: (message, detail) => log.error(detail ?? {}, message),
    },
    grants: pluginGrants(input.db, input.plugin.key),
    data: pluginData(input.db, input.plugin.key, {
      statementTimeoutMs: input.statementTimeoutMs ?? PLUGIN_STATEMENT_TIMEOUT_MS,
    }),
    users: pluginUsers(input.db),
    notify: pluginNotify(input.plugin.key, input.plugin.notifications ?? [], notifications),
  }
}
