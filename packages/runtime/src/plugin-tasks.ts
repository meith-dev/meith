/**
 * F69 — a plugin's scheduled tasks, in F06's registry.
 *
 * F79 validated `PluginTask` and namespaced it and then nothing ran it. This is
 * the adapter that makes the declaration true: each one becomes an ordinary
 * `TaskDefinition` registered under `plugin.<key>.<id>`, claimed by the same
 * lock, timed by the same tick, and recorded in the same `task_log`.
 *
 * ## It is deliberately not isolated the way a hook is
 *
 * The host swallows a hook's failure because the alternative is a plugin taking
 * down a page render. A task has no page to take down: it runs on the tick, on
 * its own, and the scheduler already knows what to do with one that throws —
 * record the failure, notify administrators (F55), and try again next tick.
 * Catching here would convert every plugin task failure into a *successful run
 * of nothing*, which is the exact condition F70's system-health screen exists to
 * make visible. So a plugin task that throws fails, loudly, as a task.
 *
 * ## Settings are read per run, not captured at registration
 *
 * The bundle is built once per process and a task can run for weeks after that.
 * Reading the plugin's settings inside `run` means an operator who changes one
 * in the panel sees it on the next tick, rather than on the next deploy.
 */
import { logger } from '@meith/core'
import { PostgresSettingsRepository, type Database } from '@meith/db'
import { pluginTaskId, resolvePluginSettings, type PluginDefinition } from '@meith/plugin-kit'
import type { TaskDefinition } from '@meith/tasks'

/**
 * What a plugin task is allowed to take.
 *
 * `PluginTask` declares an interval and no ceiling, because a plugin author has
 * no way to know the platform's function limit — that is the host's fact, not
 * theirs. Sixty seconds is the value the built-in tasks use for work that
 * touches rows in batches, and it leaves room under every serverless limit this
 * project targets.
 */
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
        /*
         * The description an operator reads on the tasks screen. A plugin does
         * not get to write it, because the fact that matters there — which
         * plugin this belongs to, so it can be switched off — is one a plugin
         * has no reason to state and every reason to omit.
         */
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
          })

          /*
           * No counters. `TaskResult.detail` is free-form and a plugin's `run`
           * returns nothing, so inventing a number here would put a figure in
           * `task_log` that no code produced.
           */
          return {}
        },
      })
    }
  }

  return definitions
}
