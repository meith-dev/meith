import { type Database, PostgresSettingsRepository, readPluginHealth } from '@meith/db'
import { type PluginDefinition, pluginEnabledKey, pluginTaskId } from '@meith/plugin-kit'
import type { TaskDefinition } from '@meith/tasks'

import { pluginRuntimeContext } from './plugin-context'

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
          if (overrides.get(pluginEnabledKey(plugin.key)) === '0') return {}

          const health = (await readPluginHealth(options.db)).find(
            (row) => row.pluginKey === plugin.key,
          )
          if (health?.disabledAt != null) {
            return { detail: { skipped: 'disabled after repeated failures' } }
          }

          await task.run(
            await pluginRuntimeContext({
              db: options.db,
              plugin,
              component: 'plugin-task',
              overrides,
            }),
          )

          return {}
        },
      })
    }
  }

  return definitions
}
