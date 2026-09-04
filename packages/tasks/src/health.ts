export interface TaskHealthInput {
  readonly key: string
  readonly intervalSeconds: number
  readonly enabled: boolean
  readonly lastRunAt: Date | null
  readonly nextRunAt: Date | null
  readonly lockedUntil?: Date | null | undefined
  readonly consecutiveFailures: number
}

export type TaskHealthStatus =
  | 'healthy'
  | 'running'
  | 'late'
  | 'stale'
  | 'failing'
  | 'disabled'
  | 'never-run'

export interface TaskHealth extends TaskHealthInput {
  readonly status: TaskHealthStatus
  readonly ageSeconds: number | null
  readonly intervalsLate: number
}

export const STALE_INTERVALS = 3

export const FAILING_THRESHOLD = 3

export function assessTask(task: TaskHealthInput, now: Date): TaskHealth {
  const ageSeconds =
    task.lastRunAt === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - task.lastRunAt.getTime()) / 1000))

  const interval = Math.max(1, task.intervalSeconds)
  const intervalsLate = ageSeconds === null ? 0 : Math.floor(ageSeconds / interval)

  const status = ((): TaskHealthStatus => {
    if (!task.enabled) return 'disabled'
    if (task.consecutiveFailures >= FAILING_THRESHOLD) return 'failing'
    if (task.lockedUntil != null && task.lockedUntil.getTime() > now.getTime()) return 'running'
    if (task.lastRunAt === null) return 'never-run'
    if (intervalsLate >= STALE_INTERVALS) return 'stale'
    if (intervalsLate >= 1) return 'late'
    return 'healthy'
  })()

  return { ...task, status, ageSeconds, intervalsLate }
}

export interface SchedulerHealth {
  readonly tasks: readonly TaskHealth[]
  readonly schedulerStopped: boolean
  readonly stale: number
  readonly failing: number
}

export function assessScheduler(tasks: readonly TaskHealthInput[], now: Date): SchedulerHealth {
  const assessed = tasks.map((task) => assessTask(task, now))
  const enabled = assessed.filter((task) => task.status !== 'disabled')

  return {
    tasks: assessed,
    schedulerStopped:
      enabled.length > 0 &&
      enabled.every((task) => task.status === 'stale' || task.status === 'never-run'),
    stale: assessed.filter((task) => task.status === 'stale').length,
    failing: assessed.filter((task) => task.status === 'failing').length,
  }
}
