/**
 * F06 acceptance: invoking the tick twice concurrently must leave the same state
 * as invoking it once.
 *
 * The fake repository models the *atomic* claim the real implementation performs
 * as a single conditional UPDATE. Modelling it as read-then-write here would let
 * the test pass against an implementation that races in production.
 */

import { describe, expect, it, vi } from 'vitest'

import { tick, type TaskRepository } from './scheduler'
import type { TaskDefinition } from './types'

interface Row {
  lastRunAt: Date | null
  runningSince: Date | null
}

class FakeTaskRepository implements TaskRepository {
  rows = new Map<string, Row>()
  releases: Array<{ taskId: string; success: boolean; error?: string }> = []

  async ensureRegistered(tasks: readonly { id: string }[]): Promise<void> {
    for (const task of tasks) {
      if (!this.rows.has(task.id)) {
        this.rows.set(task.id, { lastRunAt: null, runningSince: null })
      }
    }
  }

  /**
   * Synchronous body on purpose: it mirrors a single atomic statement, so no
   * `await` can interleave between the check and the write.
   */
  async claim(input: {
    taskId: string
    now: Date
    dueBefore: Date
    staleBefore: Date
  }): Promise<{ previousLastRunAt: Date | null } | null> {
    const row = this.rows.get(input.taskId)
    if (!row) return null

    const heldByLiveInstance =
      row.runningSince !== null && row.runningSince >= input.staleBefore
    if (heldByLiveInstance) return null

    const due = row.lastRunAt === null || row.lastRunAt <= input.dueBefore
    if (!due) return null

    const previousLastRunAt = row.lastRunAt
    row.runningSince = input.now
    row.lastRunAt = input.now
    return { previousLastRunAt }
  }

  async release(input: {
    taskId: string
    success: boolean
    error?: string
  }): Promise<void> {
    const row = this.rows.get(input.taskId)
    if (row) row.runningSince = null
    this.releases.push({
      taskId: input.taskId,
      success: input.success,
      ...(input.error ? { error: input.error } : {}),
    })
  }
}

function task(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: 'test.task',
    title: 'Test task',
    description: 'A task under test.',
    intervalSeconds: 60,
    maxDurationSeconds: 5,
    run: async () => ({}),
    ...overrides,
  }
}

describe('tick', () => {
  it('runs a task that has never run', async () => {
    const repository = new FakeTaskRepository()
    const run = vi.fn(async () => ({ detail: { processed: 3 } }))

    const outcomes = await tick({ repository, tasks: [task({ run })] })

    expect(run).toHaveBeenCalledTimes(1)
    expect(outcomes[0]).toMatchObject({ status: 'ran', detail: { processed: 3 } })
  })

  it('skips a task that is not yet due', async () => {
    const repository = new FakeTaskRepository()
    const run = vi.fn(async () => ({}))
    const tasks = [task({ run, intervalSeconds: 3600 })]

    const start = new Date('2026-01-01T00:00:00Z')
    await tick({ repository, tasks, now: start })

    /* One minute later, against an hourly task. */
    const outcomes = await tick({
      repository,
      tasks,
      now: new Date(start.getTime() + 60_000),
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(outcomes[0]?.status).toBe('skipped')
  })

  /* The headline guarantee. */
  it('executes a task once when two ticks overlap', async () => {
    const repository = new FakeTaskRepository()

    let running = 0
    let maxConcurrent = 0
    const run = vi.fn(async () => {
      running += 1
      maxConcurrent = Math.max(maxConcurrent, running)
      await new Promise((r) => setTimeout(r, 20))
      running -= 1
      return {}
    })

    const tasks = [task({ run })]
    const now = new Date('2026-01-01T00:00:00Z')

    const [first, second] = await Promise.all([
      tick({ repository, tasks, now }),
      tick({ repository, tasks, now }),
    ])

    expect(run).toHaveBeenCalledTimes(1)
    expect(maxConcurrent).toBe(1)

    const statuses = [first[0]?.status, second[0]?.status].sort()
    expect(statuses).toEqual(['ran', 'skipped'])
  })

  it('releases the claim after a failure so the task is not stuck', async () => {
    const repository = new FakeTaskRepository()
    const onError = vi.fn()
    const run = vi.fn(async () => {
      throw new Error('boom')
    })

    const outcomes = await tick({
      repository,
      tasks: [task({ run })],
      onError,
    })

    expect(outcomes[0]).toMatchObject({ status: 'failed', error: 'boom' })
    expect(onError).toHaveBeenCalledTimes(1)
    /* Critically: not left holding the lock. */
    expect(repository.rows.get('test.task')?.runningSince).toBeNull()
    expect(repository.releases[0]).toMatchObject({ success: false })
  })

  it('reclaims a task whose previous run abandoned its lock', async () => {
    const repository = new FakeTaskRepository()
    await repository.ensureRegistered([{ id: 'test.task' }])

    const stale = new Date('2026-01-01T00:00:00Z')
    repository.rows.set('test.task', { lastRunAt: stale, runningSince: stale })

    const run = vi.fn(async () => ({}))
    const outcomes = await tick({
      repository,
      tasks: [task({ run })],
      /* Well past staleClaimSeconds. */
      now: new Date(stale.getTime() + 3_600_000),
      staleClaimSeconds: 900,
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(outcomes[0]?.status).toBe('ran')
  })

  it('passes elapsed time so a task can catch up after a skipped tick', async () => {
    const repository = new FakeTaskRepository()
    const seen: number[] = []
    const run = vi.fn(async (context: { elapsedSeconds: number }) => {
      seen.push(context.elapsedSeconds)
      return {}
    })

    const tasks = [task({ run, intervalSeconds: 60 })]
    const start = new Date('2026-01-01T00:00:00Z')

    await tick({ repository, tasks, now: start })
    /* Two hours of missed ticks. */
    await tick({ repository, tasks, now: new Date(start.getTime() + 7_200_000) })

    expect(seen[0]).toBe(60)
    expect(seen[1]).toBe(7200)
  })

  it('runs tasks sequentially, not in parallel', async () => {
    const repository = new FakeTaskRepository()
    const order: string[] = []

    const make = (id: string) =>
      task({
        id,
        run: async () => {
          order.push(`${id}:start`)
          await new Promise((r) => setTimeout(r, 10))
          order.push(`${id}:end`)
          return {}
        },
      })

    await tick({ repository, tasks: [make('a'), make('b')] })

    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })
})
