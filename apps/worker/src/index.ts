/**
 * F04 — the self-hosted worker loop.
 *
 * The serverless profile drives the scheduler with a cron hitting
 * `/api/system/tick`. A self-hosted board has no cron service, so this is the
 * other half of F04's promise: **the same image runs the worker with a flag**,
 * and the worker runs the same task code the app does.
 *
 * It calls `tick()` in-process rather than polling the HTTP endpoint. Both were
 * on the table; in-process wins for two reasons that are not about tidiness:
 *
 *  1. **It does not need the app to be up.** A board whose web container is
 *     failing still expires bans, drains the queue and relays the outbox — and
 *     an operator debugging a broken deploy is exactly who needs the queue to
 *     keep moving.
 *  2. **There is no second authentication surface.** The HTTP route is
 *     protected by a shared secret; a poller means that secret in a second
 *     place, and a tick endpoint reachable by anything that learns it.
 *
 * The cost, stated: the worker container needs `DATABASE_URL`, so it is a
 * second process with database credentials. That is already true of the app
 * container, and the alternative trades it for a credential of a different kind.
 *
 * **This is an always-on process, which the architecture rules single out.** It
 * is sanctioned rather than a divergence: the roadmap's delivery profile says
 * so in as many words ("Standalone Docker image plus worker loop runs the same
 * task code"). What is *not* sanctioned is the serverless profile depending on
 * one, and it does not — nothing here is imported by the app.
 */
import { assertEnv, logger } from '@forum/core'
import { loadEnvFiles } from '@forum/core/env-files'
import { drivers } from '@forum/drivers'
import { imageProcessor } from '@forum/drivers/images'
import { buildSchedulerBundle } from '@forum/runtime'
import { tick } from '@forum/tasks'

/**
 * Bound where it is used, not at module scope (guard F02).
 *
 * A module-level instance builds pino eagerly, which reads `env.LOG_LEVEL` and
 * turns merely importing this file into an environment validation. That is
 * exactly the failure mode the worker must not have: the bundle is imported by
 * nothing else, but the rule is the rule, and it costs a function call.
 */
const log = () => logger({ module: 'worker' })

/**
 * How long to wait between ticks.
 *
 * Sixty seconds because the shortest built-in interval is `queue.drain` at 60,
 * and a loop faster than the fastest task is a loop that mostly claims nothing.
 * The tasks decide their own cadence; this only decides how often they are
 * *asked*, which is why it is a plain constant rather than a setting.
 */
const INTERVAL_MS = 60_000

/** A tick that overruns this is assumed wedged and is not waited on further. */
const TICK_TIMEOUT_MS = 300_000

let stopping = false

async function main(): Promise<number> {
  /*
   * Before `assertEnv()`, which memoises. In the image this finds nothing —
   * there is no workspace and `.dockerignore` keeps `.env` out on purpose, so
   * the container's own environment is the whole configuration. It is here for
   * `pnpm --filter @forum/worker start` against a developer's board, which
   * otherwise refuses to start with the fixture-mode message below while the
   * workspace `.env` sitting next to it says postgres.
   */
  loadEnvFiles()

  const env = assertEnv()
  if (env.DATA_SOURCE !== 'postgres') {
    /*
     * Refused rather than run against the fixture store, for the reason the
     * container gives fixture mode no scheduler at all: an in-memory task table
     * would let two instances run the same task while each believed it held the
     * claim, and a worker whose whole job is durable cross-instance work is the
     * worst possible place to pretend.
     */
    log().error('DATA_SOURCE is "fixture" — the worker needs DATABASE_URL. Refusing to start.')
    return 1
  }

  const bundle = buildSchedulerBundle({
    queue: drivers().queue,
    mail: drivers().mail,
    /* F42. The worker is where a re-encode belongs — see ADR 0003 on why
       nothing decodes an image on the request path. */
    files: drivers().files,
    images: imageProcessor,
  })
  log().info({ tasks: bundle.tasks.length, intervalMs: INTERVAL_MS }, 'worker started')

  /*
   * SIGTERM is how a container runtime asks for a shutdown. Finishing the tick
   * in flight rather than dying inside it matters: a task killed mid-run holds
   * its claim until the stale-claim window expires, which delays it by fifteen
   * minutes on the next instance.
   */
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
      /*
       * A failing task is logged and the loop continues. It is already recorded
       * in `task_log` by `tick()` itself, and stopping the worker because one
       * task threw would take the other nine down with it. The admin
       * notification is raised by `onTaskFailure` (F55); this is the log half.
       */
      for (const outcome of failed) {
        log().error({ taskId: outcome.taskId, err: outcome.error }, 'task failed')
      }
    } catch (err) {
      /*
       * The tick itself failed — the database is unreachable, or a tick
       * overran. Logged and retried on the next interval rather than crashing:
       * a restart loop against an unreachable database is noisier and no more
       * useful than waiting.
       */
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
    const timer = setTimeout(resolve, ms)
    /* Do not hold the process open for a sleep we are about to abandon. */
    timer.unref?.()
    const poll = setInterval(() => {
      if (stopping) {
        clearTimeout(timer)
        clearInterval(poll)
        resolve()
      }
    }, 250)
    poll.unref?.()
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
