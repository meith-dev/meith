import { assertEnv, initTracing, logger } from '@meith/core'
import { loadEnvFiles } from '@meith/core/env-files'
import { getDb, PostgresSystemHealthRepository } from '@meith/db'
import { drivers } from '@meith/drivers'
import { imageProcessor } from '@meith/drivers/images'
import { buildSchedulerBundle } from '@meith/runtime'
import { assessScheduler, tick } from '@meith/tasks'

const log = () => logger({ module: 'worker' })

const INTERVAL_MS = 60_000

const TICK_TIMEOUT_MS = 300_000

let stopping = false

async function main(): Promise<number> {
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
  log().info({ tasks: bundle.tasks.length, intervalMs: INTERVAL_MS }, 'worker started')

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1)
      log().info({ signal }, 'shutting down after the current tick')
      stopping = true
    })
  }

  while (!stopping) {
    const startedAt = Date.now()
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), TICK_TIMEOUT_MS)

    try {
      const outcomes = await tick({
        ...bundle,
        onError: bundle.onTaskFailure,
        signal: deadline.signal,
      })
      const ran = outcomes.filter((o) => o.status === 'ran')
      const failed = outcomes.filter((o) => o.status === 'failed')
      if (ran.length > 0 || failed.length > 0) {
        log().info(
          { ran: ran.map((o) => o.taskId), failed: failed.map((o) => o.taskId) },
          'tick complete',
        )
      }
      for (const outcome of failed) {
        log().error({ taskId: outcome.taskId, err: outcome.error }, 'task failed')
      }
      for (const outcome of outcomes.filter((o) => o.overran === true)) {
        log().warn({ taskId: outcome.taskId, durationMs: outcome.durationMs }, 'task overran')
      }
      if (deadline.signal.aborted) {
        log().warn(
          { timeoutMs: TICK_TIMEOUT_MS, elapsedMs: Date.now() - startedAt },
          'tick overran',
        )
      }
    } catch (err) {
      log().error({ err }, 'tick failed')
    } finally {
      clearTimeout(timer)
    }

    if (stopping) break
    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - startedAt)))
  }

  log().info('worker stopped')
  return 0
}

async function checkReady(): Promise<number> {
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

function sleep(ms: number): Promise<void> {
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

const entrypoint = process.argv.includes('--ready') ? checkReady : main

entrypoint()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    log().error({ err }, 'worker crashed')
    process.exit(1)
  })
