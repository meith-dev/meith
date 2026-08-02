/**
 * F70 — is the scheduler actually running?
 *
 * This is the question the System Health screen exists to answer, and it is the
 * one a board gets wrong silently. Everything catch-up in this system —
 * expiring bans, sending digests, reconciling counters, sweeping orphaned
 * uploads, delivering queued mail — happens on a tick. If the tick stops, none
 * of it fails: it simply does not happen, and the board looks completely normal
 * until somebody notices that a ban expired three weeks ago and the member is
 * still banned.
 *
 * So staleness is measured against **each task's own interval**, not against a
 * single global threshold. A task that runs every five minutes and last ran an
 * hour ago is in trouble; a task that runs daily and last ran an hour ago is
 * fine. One threshold cannot say both.
 *
 * Pure, and deliberately here rather than in the repository: "how late is too
 * late" is a judgement about the domain, and the screen, the CLI and any future
 * alerting must all reach the same verdict from the same code.
 */

/** How a task looks in the `tasks` table. */
export interface TaskHealthInput {
  readonly key: string
  readonly intervalSeconds: number
  readonly enabled: boolean
  readonly lastRunAt: Date | null
  readonly nextRunAt: Date | null
  readonly consecutiveFailures: number
}

export type TaskHealthStatus =
  /** Ran recently enough for its own cadence. */
  | 'healthy'
  /** Late, but within the grace a serverless platform can plausibly cause. */
  | 'late'
  /** Late enough that the scheduler is not running. */
  | 'stale'
  /** Failing repeatedly. Distinct from stale: it *is* running, and losing. */
  | 'failing'
  /** Switched off deliberately. Not a fault, and must not read as one. */
  | 'disabled'
  /** Registered but never run. A fresh board, or a scheduler never wired up. */
  | 'never-run'

export interface TaskHealth extends TaskHealthInput {
  readonly status: TaskHealthStatus
  /** Seconds since the last run, or null if it has never run. */
  readonly ageSeconds: number | null
  /** How many intervals late it is. 0 when on time. */
  readonly intervalsLate: number
}

/**
 * A task is *late* after one missed interval and *stale* after this many.
 *
 * Three rather than two because a serverless cron legitimately drifts: a deploy,
 * a cold start or a platform hiccup can skip a tick, and F06 designed the tasks
 * to catch up precisely so that a single miss is a non-event. Warning on the
 * first miss would train an operator to ignore the warning, which is worse than
 * not having one.
 */
export const STALE_INTERVALS = 3

/**
 * Consecutive failures before a task is called failing rather than late.
 *
 * One failure is noise — a transient database blip, a mail provider timing out.
 * Three in a row is a bug that will not fix itself.
 */
export const FAILING_THRESHOLD = 3

export function assessTask(task: TaskHealthInput, now: Date): TaskHealth {
  const ageSeconds =
    task.lastRunAt === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - task.lastRunAt.getTime()) / 1000))

  /*
   * A zero or negative interval would divide by zero and report every task as
   * infinitely late. Treated as one second, which is the smallest cadence that
   * means anything and keeps the arithmetic honest rather than throwing at a
   * screen an operator opened *because* something is wrong.
   */
  const interval = Math.max(1, task.intervalSeconds)
  const intervalsLate = ageSeconds === null ? 0 : Math.floor(ageSeconds / interval)

  const status = ((): TaskHealthStatus => {
    /*
     * Disabled first. A switched-off task is not a fault, and showing it as
     * stale would put a permanent red mark on a board that made a deliberate
     * choice — which is how a health screen stops being read.
     */
    if (!task.enabled) return 'disabled'
    if (task.consecutiveFailures >= FAILING_THRESHOLD) return 'failing'
    if (task.lastRunAt === null) return 'never-run'
    if (intervalsLate >= STALE_INTERVALS) return 'stale'
    if (intervalsLate >= 1) return 'late'
    return 'healthy'
  })()

  return { ...task, status, ageSeconds, intervalsLate }
}

export interface SchedulerHealth {
  readonly tasks: readonly TaskHealth[]
  /**
   * True when the *scheduler itself* looks stopped, rather than one task being
   * unhappy.
   *
   * The distinction matters more than any individual row: one stale task is a
   * bug in that task, and **every** enabled task stale at once is a tick that is
   * not firing — a completely different problem with a completely different fix,
   * and the one that silently breaks bans, digests and counters together.
   */
  readonly schedulerStopped: boolean
  readonly stale: number
  readonly failing: number
}

export function assessScheduler(
  tasks: readonly TaskHealthInput[],
  now: Date,
): SchedulerHealth {
  const assessed = tasks.map((task) => assessTask(task, now))
  const enabled = assessed.filter((task) => task.status !== 'disabled')

  return {
    tasks: assessed,
    /*
     * Every enabled task stale — and at least one of them, so an empty registry
     * is not reported as a stopped scheduler. A board with no tasks registered
     * has a different problem and should not be told this one.
     */
    schedulerStopped:
      enabled.length > 0 &&
      enabled.every((task) => task.status === 'stale' || task.status === 'never-run'),
    stale: assessed.filter((task) => task.status === 'stale').length,
    failing: assessed.filter((task) => task.status === 'failing').length,
  }
}
