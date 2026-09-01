import { type CronSchedule, nextRun, parseCron } from '@meith/core'

import type { TaskContext, TaskDefinition, TaskResult } from './types'

export interface TaskRepository {
  claim(input: {
    taskId: string
    now: Date
    staleBefore: Date
  }): Promise<{ previousLastRunAt: Date | null } | null>

  release(input: {
    taskId: string
    finishedAt: Date
    success: boolean
    detail?: Record<string, unknown>
    error?: string
    nextRunAt?: Date
  }): Promise<void>

  ensureRegistered(
    tasks: readonly { id: string; intervalSeconds: number; firstRunAt?: Date }[],
  ): Promise<void>
}

export interface TickOutcome {
  taskId: string
  status: 'ran' | 'skipped' | 'failed'
  durationMs: number
  overran?: true
  detail?: Record<string, unknown>
  error?: string
}

export interface TickDeps {
  repository: TaskRepository
  tasks: readonly TaskDefinition[]
  now?: Date
  staleClaimSeconds?: number
  onError?: (taskId: string, error: unknown) => void
  signal?: AbortSignal
}

export async function tick({
  repository,
  tasks,
  now = new Date(),
  staleClaimSeconds = 900,
  onError,
  signal,
}: TickDeps): Promise<TickOutcome[]> {
  const schedules = new Map<string, CronSchedule>()
  for (const task of tasks) {
    if (task.schedule !== undefined) schedules.set(task.id, parseCron(task.schedule))
  }

  await repository.ensureRegistered(
    tasks.map((t) => {
      const schedule = schedules.get(t.id)
      return schedule === undefined
        ? { id: t.id, intervalSeconds: t.intervalSeconds }
        : { id: t.id, intervalSeconds: t.intervalSeconds, firstRunAt: nextRun(schedule, now) }
    }),
  )

  const outcomes: TickOutcome[] = []
  const staleBefore = new Date(now.getTime() - staleClaimSeconds * 1000)

  for (const task of tasks) {
    const startedAt = Date.now()

    if (signal?.aborted === true) {
      outcomes.push({ taskId: task.id, status: 'skipped', durationMs: 0 })
      continue
    }

    const claim = await repository.claim({ taskId: task.id, now, staleBefore })

    if (!claim) {
      outcomes.push({ taskId: task.id, status: 'skipped', durationMs: 0 })
      continue
    }

    const budget = new AbortController()
    const timeout = setTimeout(
      () => budget.abort(new Error(`Task "${task.id}" exceeded its budget`)),
      task.maxDurationSeconds * 1000,
    )

    const elapsedSince = () => new Date(now.getTime() + (Date.now() - startedAt))

    try {
      const elapsedSeconds = claim.previousLastRunAt
        ? Math.max(0, (now.getTime() - claim.previousLastRunAt.getTime()) / 1000)
        : task.intervalSeconds

      const context: TaskContext = {
        now,
        lastRunAt: claim.previousLastRunAt,
        elapsedSeconds,
        signal: signal === undefined ? budget.signal : AbortSignal.any([signal, budget.signal]),
      }

      const result: TaskResult = await task.run(context)

      const finishedAt = elapsedSince()
      const schedule = schedules.get(task.id)

      await repository.release({
        taskId: task.id,
        finishedAt,
        success: true,
        ...(result.detail ? { detail: result.detail } : {}),
        ...(schedule ? { nextRunAt: nextRun(schedule, finishedAt) } : {}),
      })

      outcomes.push({
        taskId: task.id,
        status: 'ran',
        durationMs: Date.now() - startedAt,
        ...(budget.signal.aborted ? { overran: true as const } : {}),
        ...(result.detail ? { detail: result.detail } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onError?.(task.id, error)

      const finishedAt = elapsedSince()
      const schedule = schedules.get(task.id)

      await repository.release({
        taskId: task.id,
        finishedAt,
        success: false,
        error: message,
        ...(schedule ? { nextRunAt: nextRun(schedule, finishedAt) } : {}),
      })

      outcomes.push({
        taskId: task.id,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        ...(budget.signal.aborted ? { overran: true as const } : {}),
        error: message,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  return outcomes
}
