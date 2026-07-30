/**
 * F06 — scheduled tasks.
 *
 * The constraint that shapes this whole module: serverless cron is *not* a
 * reliable timer. A deploy, a cold start, or a platform hiccup can skip a tick
 * entirely, and a retry can fire the same tick twice. So tasks are written as
 * **catch-up** operations, not "run once at 03:00" operations.
 *
 * Concretely, each task:
 *   - computes what work is outstanding from persisted state (`lastRunAt`),
 *     rather than assuming it is being called at a particular moment;
 *   - is safe to run twice in a row with no ill effect (idempotent);
 *   - is safe to run after being skipped for a day (it catches up, or
 *     deliberately skips stale work, but never corrupts).
 *
 * F06's acceptance test drives this: invoking the tick twice concurrently must
 * produce the same state as invoking it once.
 */

export interface TaskContext {
  /** When the tick began. Passed in so tests can drive time deterministically. */
  now: Date
  /** Null on the very first run. */
  lastRunAt: Date | null
  /**
   * Logical seconds since the previous successful run, clamped. Lets a task
   * decide between "catch up" and "skip stale work".
   */
  elapsedSeconds: number
  signal: AbortSignal
}

export interface TaskResult {
  /** Free-form counters recorded in `task_log` for operator visibility. */
  detail?: Record<string, number | string>
}

export interface TaskDefinition {
  /** Stable identifier, used as the lock key and the `tasks` table primary key. */
  readonly id: string
  readonly title: string
  readonly description: string
  /**
   * Desired cadence in seconds. Advisory: the scheduler runs a task when
   * `now - lastRunAt >= intervalSeconds`, so a missed tick simply means it runs
   * on the next one rather than being lost.
   */
  readonly intervalSeconds: number
  /**
   * Hard ceiling on a single run. Vercel functions have an execution limit, so a
   * task that could exceed it must process a bounded batch and report that more
   * work remains rather than running to completion.
   */
  readonly maxDurationSeconds: number
  run(context: TaskContext): Promise<TaskResult>
}

export interface TaskRunRecord {
  taskId: string
  startedAt: Date
  finishedAt: Date | null
  success: boolean | null
  detail: Record<string, unknown> | null
  error: string | null
}
