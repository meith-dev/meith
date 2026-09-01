import { describe, expect, it, vi } from 'vitest'

import { type TaskRepository, tick } from './scheduler'
import type { TaskDefinition } from './types'

interface Row {
  intervalSeconds: number
  lastRunAt: Date | null
  nextRunAt: Date | null
  runningSince: Date | null
}

class CronFakeRepository implements TaskRepository {
  rows = new Map<string, Row>()

  async ensureRegistered(
    tasks: readonly { id: string; intervalSeconds: number; firstRunAt?: Date }[],
  ): Promise<void> {
    for (const task of tasks) {
      if (this.rows.has(task.id)) continue
      this.rows.set(task.id, {
        intervalSeconds: task.intervalSeconds,
        lastRunAt: null,
        nextRunAt: task.firstRunAt ?? null,
        runningSince: null,
      })
    }
  }

  async claim(input: {
    taskId: string
    now: Date
    staleBefore: Date
  }): Promise<{ previousLastRunAt: Date | null } | null> {
    const row = this.rows.get(input.taskId)
    if (!row) return null
    if (row.runningSince !== null && row.runningSince >= input.staleBefore) return null
    if (row.nextRunAt !== null && row.nextRunAt > input.now) return null

    const previousLastRunAt = row.lastRunAt
    row.runningSince = input.now
    row.lastRunAt = input.now
    return { previousLastRunAt }
  }

  async release(input: {
    taskId: string
    finishedAt: Date
    success: boolean
    nextRunAt?: Date
  }): Promise<void> {
    const row = this.rows.get(input.taskId)
    if (!row) return
    row.runningSince = null
    row.nextRunAt =
      input.nextRunAt ?? new Date(input.finishedAt.getTime() + row.intervalSeconds * 1000)
  }
}

function digest(run: () => void): TaskDefinition {
  return {
    id: 'digest',
    title: 'Weekly digest',
    description: 'A scheduled task under test.',
    intervalSeconds: 604_800,
    schedule: '0 9 * * 1',
    maxDurationSeconds: 30,
    async run() {
      run()
      return {}
    },
  }
}

const WEDNESDAY = new Date('2026-09-02T12:00:00Z')
const MONDAY = new Date('2026-09-07T09:00:00Z')
const TUESDAY = new Date('2026-09-08T09:00:00Z')
const NEXT_MONDAY = new Date('2026-09-14T09:00:00Z')

describe('a cron-scheduled task', () => {
  it('does not fire on the tick that first registers it', async () => {
    const repository = new CronFakeRepository()
    const run = vi.fn()

    const outcomes = await tick({ repository, tasks: [digest(run)], now: WEDNESDAY })

    expect(outcomes[0]?.status).toBe('skipped')
    expect(run).not.toHaveBeenCalled()
  })

  it('fires on a Monday tick and not on the following Tuesday tick', async () => {
    const repository = new CronFakeRepository()
    const run = vi.fn()
    const tasks = [digest(run)]

    await tick({ repository, tasks, now: WEDNESDAY })

    expect((await tick({ repository, tasks, now: MONDAY }))[0]?.status).toBe('ran')
    expect(run).toHaveBeenCalledTimes(1)

    expect((await tick({ repository, tasks, now: TUESDAY }))[0]?.status).toBe('skipped')
    expect(run).toHaveBeenCalledTimes(1)

    expect((await tick({ repository, tasks, now: NEXT_MONDAY }))[0]?.status).toBe('ran')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('fires a missed window once, not once per occurrence it slept through', async () => {
    const repository = new CronFakeRepository()
    const run = vi.fn()
    const tasks = [digest(run)]

    await tick({ repository, tasks, now: WEDNESDAY })

    const longAfter = new Date('2026-09-25T12:00:00Z')
    expect((await tick({ repository, tasks, now: longAfter }))[0]?.status).toBe('ran')
    expect(run).toHaveBeenCalledTimes(1)

    const nextDay = new Date('2026-09-26T12:00:00Z')
    expect((await tick({ repository, tasks, now: nextDay }))[0]?.status).toBe('skipped')
    expect(run).toHaveBeenCalledTimes(1)

    const following = new Date('2026-09-28T09:00:00Z')
    expect((await tick({ repository, tasks, now: following }))[0]?.status).toBe('ran')
    expect(run).toHaveBeenCalledTimes(2)
  })
})
