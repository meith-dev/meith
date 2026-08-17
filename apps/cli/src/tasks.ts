import { drivers } from '@meith/drivers'
import { imageProcessor } from '@meith/drivers/images'
import { buildSchedulerBundle, type SchedulerBundle } from '@meith/runtime'
import { tick } from '@meith/tasks'

import { requirePostgres } from './context'

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
      `No such task: ${only}\n` + `Run \`community task:list\` to see what is registered.`,
    )
    return 1
  }

  const outcomes = await tick({ repository, tasks: selected, onError: onTaskFailure })

  const ran = outcomes.filter((o) => o.status === 'ran')
  const failed = outcomes.filter((o) => o.status === 'failed')
  const skipped = outcomes.filter((o) => o.status === 'skipped')

  for (const outcome of [...ran, ...failed]) {
    const detail = outcome.detail === undefined ? '' : ` ${JSON.stringify(outcome.detail)}`
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

  return failed.length > 0 ? 1 : 0
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}
