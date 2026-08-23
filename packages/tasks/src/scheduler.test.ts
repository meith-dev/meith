import { describe, expect, it, vi } from 'vitest'

import { builtinTasks, type TaskWorkers } from './builtin'
import { type TaskRepository, tick } from './scheduler'
import type { TaskDefinition } from './types'

interface Row {
  intervalSeconds: number
  lastRunAt: Date | null
  nextRunAt: Date | null
  runningSince: Date | null
}

class FakeTaskRepository implements TaskRepository {
  rows = new Map<string, Row>()
  releases: Array<{ taskId: string; success: boolean; error?: string }> = []

  async ensureRegistered(tasks: readonly { id: string; intervalSeconds: number }[]): Promise<void> {
    for (const task of tasks) {
      const existing = this.rows.get(task.id)
      if (existing === undefined) {
        this.rows.set(task.id, {
          intervalSeconds: task.intervalSeconds,
          lastRunAt: null,
          nextRunAt: null,
          runningSince: null,
        })
        continue
      }

      if (existing.intervalSeconds !== task.intervalSeconds) {
        existing.nextRunAt =
          existing.lastRunAt === null
            ? null
            : new Date(existing.lastRunAt.getTime() + task.intervalSeconds * 1000)
        existing.intervalSeconds = task.intervalSeconds
      }
    }
  }

  async claim(input: {
    taskId: string
    now: Date
    staleBefore: Date
  }): Promise<{ previousLastRunAt: Date | null } | null> {
    const row = this.rows.get(input.taskId)
    if (!row) return null

    const heldByLiveInstance = row.runningSince !== null && row.runningSince >= input.staleBefore
    if (heldByLiveInstance) return null

    const due = row.nextRunAt === null || row.nextRunAt <= input.now
    if (!due) return null

    const previousLastRunAt = row.lastRunAt
    row.runningSince = input.now
    row.lastRunAt = input.now
    return { previousLastRunAt }
  }

  async release(input: {
    taskId: string
    finishedAt: Date
    success: boolean
    error?: string
  }): Promise<void> {
    const row = this.rows.get(input.taskId)
    if (row) {
      row.runningSince = null
      row.nextRunAt = new Date(input.finishedAt.getTime() + row.intervalSeconds * 1000)
    }
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

    const outcomes = await tick({
      repository,
      tasks,
      now: new Date(start.getTime() + 60_000),
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(outcomes[0]?.status).toBe('skipped')
  })

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
    expect(repository.rows.get('test.task')?.runningSince).toBeNull()
    expect(repository.releases[0]).toMatchObject({ success: false })
  })

  it('reclaims a task whose previous run abandoned its lock', async () => {
    const repository = new FakeTaskRepository()
    await repository.ensureRegistered([{ id: 'test.task', intervalSeconds: 60 }])

    const stale = new Date('2026-01-01T00:00:00Z')
    repository.rows.set('test.task', {
      intervalSeconds: 60,
      lastRunAt: stale,
      nextRunAt: stale,
      runningSince: stale,
    })

    const run = vi.fn(async () => ({}))
    const outcomes = await tick({
      repository,
      tasks: [task({ run })],
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

  it('schedules the next run on the clock it was ticked with', async () => {
    const repository = new FakeTaskRepository()
    const now = new Date('2026-01-01T00:00:00Z')

    await tick({ repository, tasks: [task({ intervalSeconds: 300 })], now })

    const next = repository.rows.get('test.task')?.nextRunAt
    expect(next!.getTime()).toBeGreaterThanOrEqual(now.getTime() + 300_000)
    expect(next!.getTime()).toBeLessThan(now.getTime() + 310_000)
  })
})

describe('the budget a task declares', () => {
  it('aborts the signal the task is handed once the budget is spent', async () => {
    const repository = new FakeTaskRepository()
    const aborted: boolean[] = []

    const run = async (context: { signal: AbortSignal }) => {
      await new Promise((resolve) => setTimeout(resolve, 60))
      aborted.push(context.signal.aborted)
      return {}
    }

    await tick({ repository, tasks: [task({ run, maxDurationSeconds: 0.02 })] })

    expect(aborted).toEqual([true])
  })

  it('reports the overrun, so a decorative budget cannot stay quiet', async () => {
    const repository = new FakeTaskRepository()

    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
      return {}
    }

    const [outcome] = await tick({
      repository,
      tasks: [task({ run, maxDurationSeconds: 0.02 })],
    })

    expect(outcome).toMatchObject({ status: 'ran', overran: true })
  })

  it('leaves the signal alone for a task that finishes inside its budget', async () => {
    const repository = new FakeTaskRepository()
    let seen: boolean | undefined

    const run = async (context: { signal: AbortSignal }) => {
      seen = context.signal.aborted
      return {}
    }

    const [outcome] = await tick({ repository, tasks: [task({ run })] })

    expect(seen).toBe(false)
    expect(outcome).not.toHaveProperty('overran')
  })

  it('releases the claim when a task is cut short, so the next tick can run it', async () => {
    const repository = new FakeTaskRepository()

    const run = async (context: { signal: AbortSignal }) => {
      await new Promise((resolve) => setTimeout(resolve, 60))
      if (context.signal.aborted) return { detail: { partial: 1 } }
      return {}
    }

    await tick({ repository, tasks: [task({ run, maxDurationSeconds: 0.02 })] })

    expect(repository.rows.get('test.task')?.runningSince).toBeNull()
    expect(repository.releases[0]).toMatchObject({ success: true })
  })
})

describe('a tick that is cut short', () => {
  it('stops claiming further tasks once the tick signal aborts', async () => {
    const repository = new FakeTaskRepository()
    const controller = new AbortController()
    const ran: string[] = []

    const make = (id: string) =>
      task({
        id,
        run: async () => {
          ran.push(id)
          controller.abort()
          return {}
        },
      })

    const outcomes = await tick({
      repository,
      tasks: [make('a'), make('b')],
      signal: controller.signal,
    })

    expect(ran).toEqual(['a'])
    expect(outcomes.map((o) => o.status)).toEqual(['ran', 'skipped'])
  })

  it('hands the tick signal to the task, so the work in flight can stop too', async () => {
    const repository = new FakeTaskRepository()
    const controller = new AbortController()
    let aborted: boolean | undefined

    const run = async (context: { signal: AbortSignal }) => {
      controller.abort()
      aborted = context.signal.aborted
      return {}
    }

    await tick({ repository, tasks: [task({ run })], signal: controller.signal })

    expect(aborted).toBe(true)
  })

  it('runs nothing at all when the signal aborted before it started', async () => {
    const repository = new FakeTaskRepository()
    const run = vi.fn(async () => ({}))

    const outcomes = await tick({
      repository,
      tasks: [task({ run })],
      signal: AbortSignal.abort(),
    })

    expect(run).not.toHaveBeenCalled()
    expect(outcomes[0]?.status).toBe('skipped')
  })
})

describe('bans.expire is registered', () => {
  function workers(overrides: Partial<TaskWorkers> = {}): TaskWorkers {
    const zero = async () => 0
    return {
      relayOutbox: zero,
      pruneRateLimits: zero,
      pruneAuthEvents: zero,
      deliverWebhooks: async () => ({ attempted: 0, delivered: 0, retried: 0, dead: 0 }),
      sweepAttachments: async () => ({ deleted: 0, failed: 0 }),
      sweepAvatars: zero,
      rollUpStatistics: async () => ({ memberCount: 0, online: 0, record: false }),
      drainQueue: zero,
      pruneSessions: zero,
      pruneExpiredTokens: zero,
      reconcileCounters: zero,
      flushThreadViews: zero,
      backfillPostRenders: zero,
      reindexSearch: zero,
      refreshMarketplaceCatalog: async () => ({ ok: true, listingCount: 0, notified: 0 }),
      notifySubscribers: zero,
      sendDigests: zero,
      expireWarnings: zero,
      applyPromotions: zero,
      expireBans: zero,
      expireGroupMemberships: zero,
      ...overrides,
    }
  }

  it('appears in the builtin registry', () => {
    expect(builtinTasks(workers()).map((t) => t.id)).toContain('bans.expire')
  })

  it('delegates to the worker and reports how many lifted', async () => {
    const task = builtinTasks(workers({ expireBans: async () => 3 })).find(
      (t) => t.id === 'bans.expire',
    )

    const result = await task!.run({
      now: new Date(),
      lastRunAt: null,
      elapsedSeconds: 0,
      signal: new AbortController().signal,
    })
    expect(result.detail).toEqual({ lifted: 3 })
  })

  it('runs often enough that an expiry is not visibly late', () => {
    const task = builtinTasks(workers()).find((t) => t.id === 'bans.expire')
    expect(task!.intervalSeconds).toBeLessThanOrEqual(900)
  })

  it('is bounded, so one tick cannot run unbounded', async () => {
    let asked = 0
    const task = builtinTasks(
      workers({
        expireBans: async (batch) => {
          asked = batch
          return 0
        },
      }),
    ).find((t) => t.id === 'bans.expire')

    await task!.run({
      now: new Date(),
      lastRunAt: null,
      elapsedSeconds: 0,
      signal: new AbortController().signal,
    })
    expect(asked).toBeGreaterThan(0)
  })
})

function fullWorkerSet(): TaskWorkers {
  return {
    relayOutbox: async () => 0,
    pruneRateLimits: async () => 0,
    pruneAuthEvents: async () => 0,
    deliverWebhooks: async () => ({ attempted: 0, delivered: 0, retried: 0, dead: 0 }),
    sweepAttachments: async () => ({ deleted: 0, failed: 0 }),
    sweepAvatars: async () => 0,
    rollUpStatistics: async () => ({ memberCount: 0, online: 0, record: false }),
    drainQueue: async () => 0,
    pruneSessions: async () => 0,
    pruneExpiredTokens: async () => 0,
    reconcileCounters: async () => 0,
    flushThreadViews: async () => 0,
    notifySubscribers: async () => 0,
    sendDigests: async () => 0,
    backfillPostRenders: async () => 0,
    reindexSearch: async () => 0,
    refreshMarketplaceCatalog: async () => ({ ok: true, listingCount: 0, notified: 0 }),
    expireWarnings: async () => 0,
    applyPromotions: async () => 0,
    expireBans: async () => 0,
    expireGroupMemberships: async () => 0,
  }
}

describe('search.reindex is registered', () => {
  it('appears in the builtin registry', () => {
    expect(builtinTasks(fullWorkerSet()).map((t) => t.id)).toContain('search.reindex')
  })

  it('delegates to the worker and reports how many it indexed', async () => {
    const batches: number[] = []
    const task = builtinTasks({
      reindexSearch: async (batchSize) => {
        batches.push(batchSize)
        return 7
      },
    }).find((t) => t.id === 'search.reindex')

    const result = await task!.run({
      now: new Date(),
      lastRunAt: null,
      elapsedSeconds: 0,
      signal: new AbortController().signal,
    })

    expect(result).toEqual({ detail: { indexed: 7 } })
    expect(batches).toEqual([200])
  })
})

describe('builtinTasks registers only what can run', () => {
  it('omits a task whose worker is missing', () => {
    const ids = builtinTasks({ expireBans: async () => 0 }).map((t) => t.id)

    expect(ids).toEqual(['bans.expire'])
    expect(ids).not.toContain('counters.reconcile')
  })

  it('registers a task as soon as its worker appears', () => {
    const before = builtinTasks({}).map((t) => t.id)
    const after = builtinTasks({ reconcileCounters: async () => 0 }).map((t) => t.id)

    expect(before).toEqual([])
    expect(after).toContain('counters.reconcile')
  })

  it('registers everything when the full set is supplied', () => {
    const workers = fullWorkerSet()
    const all = builtinTasks(workers)

    expect(all).toHaveLength(Object.keys(workers).length)
    expect(new Set(all.map((task) => task.id)).size).toBe(all.length)
  })

  it('gives every task a worker mapping, so none can be silently unregisterable', () => {
    const ids = builtinTasks(fullWorkerSet()).map((t) => t.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(Object.keys(fullWorkerSet()).length)
  })
})
