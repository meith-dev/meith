import { assertEnv, logger } from '@meith/core'
import { loadEnvFiles } from '@meith/core/env-files'
import { drivers } from '@meith/drivers'
import { imageProcessor } from '@meith/drivers/images'
import { buildSchedulerBundle } from '@meith/runtime'
import { tick } from '@meith/tasks'

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
    try {
      const outcomes = await withTimeout(
        tick({ ...bundle, onError: bundle.onTaskFailure }),
        TICK_TIMEOUT_MS,
      )
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
    } catch (err) {
      log().error({ err }, 'tick failed')
    }

    if (stopping) break
    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - startedAt)))
  }

  log().info('worker stopped')
  return 0
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

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`tick exceeded ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    log().error({ err }, 'worker crashed')
    process.exit(1)
  })
