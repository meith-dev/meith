import type { TaskDefinition, TaskContext, TaskResult } from './types'

export interface TaskRepository {
  claim(input: {
    taskId: string
    now: Date
    dueBefore: Date
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
  detail?: Record<string, unknown>
  error?: string
}

export interface TickDeps {
  repository: TaskRepository
  tasks: readonly TaskDefinition[]
  now?: Date
  staleClaimSeconds?: number
  onError?: (taskId: string, error: unknown) => void
}

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
