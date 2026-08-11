import { logger, readPluginEnv } from '@meith/core'
import {
  PostgresNotificationRepository,
  PostgresSettingsRepository,
  pluginData,
  pluginGrants,
  pluginUsers,
  type Database,
} from '@meith/db'
import { NotificationService } from '@meith/notifications'
import {
  pluginNotificationKindSpecs,
  pluginNotify,
  pluginTaskId,
  resolvePluginSettings,
  type PluginDefinition,
} from '@meith/plugin-kit'
import type { TaskDefinition } from '@meith/tasks'

const MAX_DURATION_SECONDS = 60

const TASK_STATEMENT_TIMEOUT_MS = 30_000

export function pluginTasks(options: {
  readonly db: Database
  readonly plugins: readonly PluginDefinition[]
}): TaskDefinition[] {
  const definitions: TaskDefinition[] = []

  const notifications = new NotificationService({
    notifications: new PostgresNotificationRepository(options.db),
    extraKinds: options.plugins.flatMap((plugin) =>
      pluginNotificationKindSpecs(plugin.key, plugin.notifications ?? []),
    ),
  })

  for (const plugin of options.plugins) {
    for (const task of plugin.tasks ?? []) {
      const id = pluginTaskId(plugin.key, task.id)

      definitions.push({
        id,
        title: `${plugin.name}: ${task.id}`,
        description: `Scheduled task contributed by the "${plugin.key}" plugin.`,
        intervalSeconds: task.intervalSeconds,
        maxDurationSeconds: MAX_DURATION_SECONDS,
        async run() {
          const overrides = await new PostgresSettingsRepository(options.db).loadAll()
          const log = logger({ component: 'plugin-task', plugin: plugin.key })

          await task.run({
            settings: resolvePluginSettings(plugin, overrides, readPluginEnv),
            logger: {
              info: (message, detail) => log.info(detail ?? {}, message),
              warn: (message, detail) => log.warn(detail ?? {}, message),
              error: (message, detail) => log.error(detail ?? {}, message),
            },
            grants: pluginGrants(options.db, plugin.key),
            data: pluginData(options.db, plugin.key, {
              statementTimeoutMs: TASK_STATEMENT_TIMEOUT_MS,
            }),
            users: pluginUsers(options.db),
            notify: pluginNotify(plugin.key, plugin.notifications ?? [], notifications),
          })

          return {}
        },
      })
    }
  }

  return definitions
}
