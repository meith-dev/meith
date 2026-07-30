/**
 * F06 — the tick scheduler.
 *
 * Concurrency is the whole problem here. Two overlapping ticks (a slow run plus
 * the next cron fire, or a platform retry) must not both execute the same task.
 * The guard is a database-level conditional claim, not an in-process mutex:
 * serverless instances share no memory, so a JavaScript lock would protect
 * nothing.
 */

import type { TaskDefinition, TaskContext, TaskResult } from './types'

/**
 * Storage seam for task state.
 *
 * `claim` must be atomic. The intended implementation is a single UPDATE with a
 * WHERE clause asserting the task is not already running and is actually due:
 *
 *   UPDATE tasks SET running_since = $now, last_run_at = $now
 *   WHERE id = $id
 *     AND (running_since IS NULL OR running_since < $staleBefore)
 *     AND (last_run_at IS NULL OR last_run_at <= $dueBefore)
 *   RETURNING last_run_at
 *
 * Returning null means another instance holds the claim, or the task is not due.
 * Doing the check as a read-then-write would reintroduce the race.
 */
export interface TaskRepository {
  claim(input: {
    taskId: string
    now: Date
    /** Tasks are due when lastRunAt <= this. */
    dueBefore: Date
    /** A claim older than this is treated as abandoned by a dead instance. */
    staleBefore: Date
  }): Promise<{ previousLastRunAt: Date | null } | null>

  release(input: {
    taskId: string
    finishedAt: Date
    success: boolean
    detail?: Record<string, unknown>
    error?: string
  }): Promise<void>

  /** Ensures a row exists for every registered task. Idempotent. */
  ensureRegistered(tasks: readonly { id: string; intervalSeconds: number }[]): Promise<void>
}

export interface TickOutcome {
  taskId: string
  status: 'ran' | 'skipped' | 'failed'
  durationMs: number
  detail?: Record<string, unknown>
  error?: string
}

export interface TickDeps {
  repository: TaskRepository
  tasks: readonly TaskDefinition[]
  now?: Date
  /**
   * How long before a running claim is considered abandoned. Must exceed the
   * platform's function timeout, or a slow-but-healthy task will have its lock
   * stolen mid-run.
   */
  staleClaimSeconds?: number
  onError?: (taskId: string, error: unknown) => void
}

/**
 * Runs every due task once.
 *
 * Tasks run sequentially rather than in parallel: they share a small connection
 * pool (F03 caps it at 3 per instance), and a fan-out would exhaust it and make
 * every task fail on connection acquisition instead of one task running slowly.
 */
export async function tick({
  repository,
  tasks,
  now = new Date(),
  staleClaimSeconds = 900,
  onError,
}: TickDeps): Promise<TickOutcome[]> {
  await repository.ensureRegistered(
    tasks.map((t) => ({ id: t.id, intervalSeconds: t.intervalSeconds })),
  )

  const outcomes: TickOutcome[] = []
  const staleBefore = new Date(now.getTime() - staleClaimSeconds * 1000)

  for (const task of tasks) {
    const startedAt = Date.now()

    const claim = await repository.claim({
      taskId: task.id,
      now,
      dueBefore: new Date(now.getTime() - task.intervalSeconds * 1000),
      staleBefore,
    })

    /*
     * Not an error: the common case is simply "not due yet", and the other case
     * is a concurrent tick already handling it. Either way this instance has
     * nothing to do, which is exactly the property F06's double-invoke test
     * asserts.
     */
    if (!claim) {
      outcomes.push({ taskId: task.id, status: 'skipped', durationMs: 0 })
      continue
    }

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error(`Task "${task.id}" exceeded its budget`)),
      task.maxDurationSeconds * 1000,
    )

    try {
      const elapsedSeconds = claim.previousLastRunAt
        ? Math.max(0, (now.getTime() - claim.previousLastRunAt.getTime()) / 1000)
        : task.intervalSeconds

      const context: TaskContext = {
        now,
        lastRunAt: claim.previousLastRunAt,
        elapsedSeconds,
        signal: controller.signal,
      }

      const result: TaskResult = await task.run(context)

      await repository.release({
        taskId: task.id,
        finishedAt: new Date(),
        success: true,
        ...(result.detail ? { detail: result.detail } : {}),
      })

      outcomes.push({
        taskId: task.id,
        status: 'ran',
        durationMs: Date.now() - startedAt,
        ...(result.detail ? { detail: result.detail } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onError?.(task.id, error)

      /*
       * The claim is released with success=false rather than left dangling. A
       * dangling claim would block the task until staleClaimSeconds elapsed,
       * turning one transient failure into fifteen minutes of downtime for that
       * task.
       */
      await repository.release({
        taskId: task.id,
        finishedAt: new Date(),
        success: false,
        error: message,
      })

      outcomes.push({
        taskId: task.id,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: message,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  return outcomes
}
