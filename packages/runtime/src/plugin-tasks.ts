import { logger } from '@meith/core'
import { PostgresSettingsRepository, pluginGrants, type Database } from '@meith/db'
import { pluginTaskId, resolvePluginSettings, type PluginDefinition } from '@meith/plugin-kit'
import type { TaskDefinition } from '@meith/tasks'

const MAX_DURATION_SECONDS = 60

export function pluginTasks(options: {
  readonly db: Database
  readonly plugins: readonly PluginDefinition[]
}): TaskDefinition[] {
  const definitions: TaskDefinition[] = []

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
            settings: resolvePluginSettings(plugin, overrides),
            logger: {
              info: (message, detail) => log.info(detail ?? {}, message),
              warn: (message, detail) => log.warn(detail ?? {}, message),
              error: (message, detail) => log.error(detail ?? {}, message),
            },
            grants: pluginGrants(options.db, plugin.key),
          })

          return {}
        },
      })
    }
  }

  return definitions
}
