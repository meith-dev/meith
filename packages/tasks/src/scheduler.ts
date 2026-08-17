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
  }): Promise<void>

  ensureRegistered(tasks: readonly { id: string; intervalSeconds: number }[]): Promise<void>
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
  await repository.ensureRegistered(
    tasks.map((t) => ({ id: t.id, intervalSeconds: t.intervalSeconds })),
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

      await repository.release({
        taskId: task.id,
        finishedAt: elapsedSince(),
        success: true,
        ...(result.detail ? { detail: result.detail } : {}),
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

      await repository.release({
        taskId: task.id,
        finishedAt: elapsedSince(),
        success: false,
        error: message,
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
