/**
 * F13 — `task:run` and `task:list`.
 *
 * Blocked until F06 gave the scheduler a real `TaskRepository`; the CLI's own
 * header recorded that, and this is the command it was waiting for. An operator
 * needs it more now that ten built-in tasks are registered and the only other
 * way to run one is to wait for the cron that hits `/api/system/tick`.
 *
 * **It runs what is *due*, and it does not force.** Forcing was written first
 * and then deleted: the obvious implementation is to hand `tick()` a definition
 * with `intervalSeconds: 0`, and `ensureRegistered` writes that interval to the
 * `tasks` row — so a one-off `--force` would silently reschedule that task to
 * run on *every* tick from then on, which is a footgun an operator would find
 * weeks later as a task hammering the database. The other route, shifting `now`
 * into the future, writes the fake timestamp into `last_run_at`.
 *
 * Neither is worth it for what the command is actually for. "Force a tick"
 * means "do not wait for the cron", and that is exactly what running the due
 * set does. A task that is genuinely not due is one an operator should be told
 * about — which `task:list` is for.
 */
import { drivers } from '@forum/drivers'
import { imageProcessor } from '@forum/drivers/images'
import { buildSchedulerBundle, type SchedulerBundle } from '@forum/runtime'
import { tick } from '@forum/tasks'

import { requirePostgres } from './context'

/**
 * The same bundle the app's tick route uses and the worker loops over.
 *
 * Built here rather than reached for through the CLI's own `CliContext`: the
 * scheduler needs the queue driver and none of the identity services, and
 * `@forum/runtime` is the one place that knows which implementation backs each
 * task (see that package's header).
 */
function scheduler(): SchedulerBundle {
  requirePostgres()
  return buildSchedulerBundle({
    queue: drivers().queue,
    mail: drivers().mail,
    files: drivers().files,
    images: imageProcessor,
  })
}

export async function taskList(): Promise<number> {
  const { tasks } = scheduler()
  const width = Math.max(...tasks.map((t) => t.id.length))
  console.log(`${tasks.length} registered task(s):\n`)
  for (const task of tasks) {
    console.log(`  ${task.id.padEnd(width)}  every ${formatInterval(task.intervalSeconds)}`)
    console.log(`  ${' '.repeat(width)}  ${task.title}`)
  }
  return 0
}

export async function taskRun(args: readonly string[]): Promise<number> {
  const only = args[0]
  const { repository, tasks, onTaskFailure } = scheduler()
  const selected = only === undefined ? tasks : tasks.filter((t) => t.id === only)
  if (only !== undefined && selected.length === 0) {
    console.error(
      `No such task: ${only}\n` +
        `Run \`forum task:list\` to see what is registered.`,
    )
    return 1
  }

  /*
   * The same failure notifier the cron path uses (F55). An operator running a
   * task by hand is exactly when a failure needs to reach the administrators
   * who are not watching this terminal.
   */
  const outcomes = await tick({ repository, tasks: selected, onError: onTaskFailure })

  /*
   * `skipped` is the common case and is not a failure: another instance holds
   * the claim, or the task simply is not due yet. Saying which is what makes
   * the command usable — an operator who ran it and saw nothing happen needs
   * to know whether to wait or to investigate.
   */
  const ran = outcomes.filter((o) => o.status === 'ran')
  const failed = outcomes.filter((o) => o.status === 'failed')
  const skipped = outcomes.filter((o) => o.status === 'skipped')

  for (const outcome of [...ran, ...failed]) {
    const detail =
    outcome.detail === undefined ? '' : ` ${JSON.stringify(outcome.detail)}`
    console.log(
      `${outcome.status === 'ran' ? 'ran    ' : 'FAILED '} ${outcome.taskId}` +
        ` (${outcome.durationMs}ms)${detail}` +
        (outcome.error === undefined ? '' : `\n        ${outcome.error}`),
    )
  }
  if (skipped.length > 0) {
    console.log(
      `skipped ${skipped.length} not due or already claimed: ` +
        skipped.map((o) => o.taskId).join(', '),
    )
  }
  if (outcomes.length === 0) console.log('Nothing registered to run.')

  /* A non-zero exit so a cron wrapper or CI step notices a failing task. */
  return failed.length > 0 ? 1 : 0
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}
