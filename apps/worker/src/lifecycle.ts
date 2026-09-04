import { assertEnv, initTracing, logger } from '@meith/core'
import { loadEnvFiles } from '@meith/core/env-files'
import { getDb, PostgresSystemHealthRepository } from '@meith/db'
import { drivers } from '@meith/drivers'
import { imageProcessor } from '@meith/drivers/images'
import { BACKUP_LEASE_SECONDS, buildSchedulerBundle, type SchedulerBundle } from '@meith/runtime'
import { assessScheduler, type TaskDefinition, tick } from '@meith/tasks'

const log = () => logger({ module: 'worker' })

export const INTERVAL_MS = 60_000
export const TICK_TIMEOUT_MS = 300_000

export const LONG_LANE_TIMEOUT_MS = 6 * 60 * 60_000
export const LONG_LANE_STALE_CLAIM_SECONDS = BACKUP_LEASE_SECONDS

let stopping = false

export interface Lane {
  readonly name: string
  readonly tasks: readonly TaskDefinition[]
  readonly timeoutMs: number
  readonly staleClaimSeconds?: number | undefined
}

export function splitLanes(tasks: readonly TaskDefinition[]): readonly Lane[] {
  const quick = tasks.filter((task) => task.lane === undefined)
  const long = tasks.filter((task) => task.lane === 'long')
  return [
    { name: 'tick', tasks: quick, timeoutMs: TICK_TIMEOUT_MS },
    ...(long.length === 0
      ? []
      : [
          {
            name: 'long',
            tasks: long,
            timeoutMs: LONG_LANE_TIMEOUT_MS,
            staleClaimSeconds: LONG_LANE_STALE_CLAIM_SECONDS,
          },
        ]),
  ]
}

async function runLane(bundle: SchedulerBundle, lane: Lane): Promise<void> {
  while (!stopping) {
    const startedAt = Date.now()
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), lane.timeoutMs)

    try {
      const outcomes = await tick({
        repository: bundle.repository,
        tasks: lane.tasks,
        onError: bundle.onTaskFailure,
        signal: deadline.signal,
        ...(lane.staleClaimSeconds === undefined
          ? {}
          : { staleClaimSeconds: lane.staleClaimSeconds }),
      })
      const ran = outcomes.filter((outcome) => outcome.status === 'ran')
      const failed = outcomes.filter((outcome) => outcome.status === 'failed')
      if (ran.length > 0 || failed.length > 0) {
        log().info(
          {
            lane: lane.name,
            ran: ran.map((outcome) => outcome.taskId),
            failed: failed.map((outcome) => outcome.taskId),
          },
          'tick complete',
        )
      }
      for (const outcome of failed) {
        log().error({ taskId: outcome.taskId, err: outcome.error }, 'task failed')
      }
      for (const outcome of outcomes.filter((outcome) => outcome.overran === true)) {
        log().warn({ taskId: outcome.taskId, durationMs: outcome.durationMs }, 'task overran')
      }
      if (deadline.signal.aborted) {
        log().warn(
          { lane: lane.name, timeoutMs: lane.timeoutMs, elapsedMs: Date.now() - startedAt },
          'tick overran',
        )
      }
    } catch (err) {
      log().error({ lane: lane.name, err }, 'tick failed')
    } finally {
      clearTimeout(timer)
    }

    if (stopping) break
    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - startedAt)))
  }
}

export async function main(): Promise<number> {
  stopping = false
  loadEnvFiles()

  const env = assertEnv()
  if (env.DATA_SOURCE !== 'postgres') {
    log().error('DATA_SOURCE is "fixture" — the worker needs DATABASE_URL. Refusing to start.')
    return 1
  }

  await initTracing('meith-worker')

  const bundle = buildSchedulerBundle({
    queue: drivers().queue,
    mail: drivers().mail,
    files: drivers().files,
    images: imageProcessor,
  })
  const lanes = splitLanes(bundle.tasks)
  log().info(
    { tasks: bundle.tasks.length, lanes: lanes.map((lane) => lane.name), intervalMs: INTERVAL_MS },
    'worker started',
  )

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1)
      log().info({ signal }, 'shutting down after the current tick')
      stopping = true
    })
  }

  await Promise.all(lanes.map((lane) => runLane(bundle, lane)))

  log().info('worker stopped')
  return 0
}

export async function checkReady(): Promise<number> {
  loadEnvFiles()

  const env = assertEnv()
  if (env.DATA_SOURCE !== 'postgres') {
    log().error('DATA_SOURCE is "fixture" — nothing durable to be ready against.')
    return 1
  }

  try {
    const repository = new PostgresSystemHealthRepository(getDb())
    const tasks = await repository.taskHealth()
    const health = assessScheduler(tasks, new Date())

    if (health.schedulerStopped) {
      log().warn({ stale: health.stale, failing: health.failing }, 'scheduler has stopped')
      return 1
    }

    return 0
  } catch (err) {
    log().error({ err }, 'readiness check could not reach the database')
    return 1
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearInterval(poll)
      resolve()
    }, ms)
    const poll = setInterval(() => {
      if (stopping) {
        clearTimeout(timer)
        clearInterval(poll)
        resolve()
      }
    }, 250)
  })
}
