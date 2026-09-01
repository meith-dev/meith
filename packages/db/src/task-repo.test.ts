import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type TaskDefinition, tick } from '@meith/tasks'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { taskLog, tasks } from './schema'
import { PostgresTaskRepository } from './task-repo'

let harness: TestDb
let db: Database
let repo: PostgresTaskRepository

const NOW = new Date('2026-07-30T12:00:00Z')
const LEASE_SECONDS = 900

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresTaskRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(taskLog)
  await db.delete(tasks)
})

function claimArgs(taskId: string, now = NOW) {
  return {
    taskId,
    now,
    staleBefore: new Date(now.getTime() - LEASE_SECONDS * 1000),
  }
}

describe('ensureRegistered', () => {
  it('creates a row per task and is idempotent', async () => {
    const defs = [
      { id: 'a', intervalSeconds: 60 },
      { id: 'b', intervalSeconds: 120 },
    ]
    await repo.ensureRegistered(defs)
    await repo.ensureRegistered(defs)

    expect(await db.select({ key: tasks.key }).from(tasks)).toHaveLength(2)
  })

  it('updates a changed cadence', async () => {
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 300 }])

    const [row] = await db.select({ i: tasks.intervalSeconds }).from(tasks)
    expect(row?.i).toBe(300)
  })

  it('leaves a task due at once, so a new registration does not wait an interval', async () => {
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 3600 }])

    const [row] = await db.select({ next: tasks.nextRunAt }).from(tasks)
    expect(row?.next?.getTime()).toBeLessThanOrEqual(new Date('2000-01-01').getTime())
  })

  it('honours a firstRunAt so a scheduled task waits for its next window', async () => {
    const firstRunAt = new Date('2026-08-31T09:00:00Z')
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 604_800, firstRunAt }])

    const [row] = await db.select({ next: tasks.nextRunAt }).from(tasks)
    expect(row?.next?.toISOString()).toBe(firstRunAt.toISOString())
    expect(await repo.claim(claimArgs('a', new Date('2026-08-30T09:00:00Z')))).toBeNull()
  })

  it('moves the due time when the cadence changes, rather than honouring the old one', async () => {
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 86_400 }])
    await repo.claim(claimArgs('a'))
    await repo.release({ taskId: 'a', finishedAt: NOW, success: true })

    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])

    const [row] = await db.select({ next: tasks.nextRunAt }).from(tasks)
    expect(row?.next?.toISOString()).toBe(new Date(NOW.getTime() + 60_000).toISOString())
  })

  it('leaves the due time alone when the cadence has not changed', async () => {
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])
    await repo.claim(claimArgs('a'))
    await repo.release({ taskId: 'a', finishedAt: NOW, success: true })

    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])

    const [row] = await db.select({ next: tasks.nextRunAt }).from(tasks)
    expect(row?.next?.toISOString()).toBe(new Date(NOW.getTime() + 60_000).toISOString())
  })

  it('preserves runtime state across re-registration', async () => {
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])
    await repo.claim(claimArgs('a'))
    await repo.release({ taskId: 'a', finishedAt: NOW, success: false })

    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])

    const [row] = await db
      .select({ last: tasks.lastRunAt, fails: tasks.consecutiveFailures })
      .from(tasks)
    expect(row?.last).not.toBeNull()
    expect(row?.fails).toBe(1)
  })
})

describe('claim', () => {
  beforeEach(async () => {
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])
  })

  it('claims a task that has never run', async () => {
    const claim = await repo.claim(claimArgs('a'))
    expect(claim).not.toBeNull()
    expect(claim?.previousLastRunAt).toBeNull()
  })

  it('returns the previous run time, not the one it just wrote', async () => {
    const first = new Date('2026-07-30T10:00:00Z')
    await repo.claim(claimArgs('a', first))
    await repo.release({ taskId: 'a', finishedAt: first, success: true })

    const second = await repo.claim(claimArgs('a', NOW))
    expect(second?.previousLastRunAt?.toISOString()).toBe(first.toISOString())
  })

  it('lets only one of two concurrent claims win', async () => {
    const [first, second] = await Promise.all([
      repo.claim(claimArgs('a')),
      repo.claim(claimArgs('a')),
    ])

    expect([first, second].filter((c) => c !== null)).toHaveLength(1)
  })

  it('refuses a second claim while the lease is live', async () => {
    await repo.claim(claimArgs('a'))
    expect(await repo.claim(claimArgs('a'))).toBeNull()
  })

  it('refuses a task that is not due yet', async () => {
    await repo.claim(claimArgs('a'))
    await repo.release({ taskId: 'a', finishedAt: NOW, success: true })

    const soon = new Date(NOW.getTime() + 1000)
    expect(await repo.claim(claimArgs('a', soon))).toBeNull()
  })

  it('selects on next_run_at, the column release writes', async () => {
    await repo.claim(claimArgs('a'))
    await repo.release({ taskId: 'a', finishedAt: NOW, success: true })

    const justBefore = new Date(NOW.getTime() + 59_000)
    expect(await repo.claim(claimArgs('a', justBefore))).toBeNull()

    const due = new Date(NOW.getTime() + 60_000)
    expect(await repo.claim(claimArgs('a', due))).not.toBeNull()
  })

  it('measures the interval from the finish, so a slow run does not run back to back', async () => {
    await repo.claim(claimArgs('a'))
    const finished = new Date(NOW.getTime() + 50_000)
    await repo.release({ taskId: 'a', finishedAt: finished, success: true })

    const oneIntervalFromTheStart = new Date(NOW.getTime() + 60_000)
    expect(await repo.claim(claimArgs('a', oneIntervalFromTheStart))).toBeNull()

    const oneIntervalFromTheFinish = new Date(finished.getTime() + 60_000)
    expect(await repo.claim(claimArgs('a', oneIntervalFromTheFinish))).not.toBeNull()
  })

  it('refuses to re-enter a task that is still running past its interval', async () => {
    await repo.claim(claimArgs('a'))

    const overrunning = new Date(NOW.getTime() + 120_000)
    expect(await repo.claim(claimArgs('a', overrunning))).toBeNull()
  })

  it('reclaims a task whose lease expired, because that worker died', async () => {
    await repo.claim(claimArgs('a'))

    const later = new Date(NOW.getTime() + (LEASE_SECONDS + 60) * 1000)
    expect(await repo.claim(claimArgs('a', later))).not.toBeNull()
  })

  it('refuses a disabled task', async () => {
    await db.update(tasks).set({ enabled: false }).where(eq(tasks.key, 'a'))
    expect(await repo.claim(claimArgs('a'))).toBeNull()
  })

  it('returns null for an unknown task rather than throwing', async () => {
    expect(await repo.claim(claimArgs('never-registered'))).toBeNull()
  })
})

describe('release', () => {
  beforeEach(async () => {
    await repo.ensureRegistered([{ id: 'a', intervalSeconds: 60 }])
    await repo.claim(claimArgs('a'))
  })

  it('frees the lease so the next due tick can claim', async () => {
    await repo.release({ taskId: 'a', finishedAt: NOW, success: true })

    const later = new Date(NOW.getTime() + 120_000)
    expect(await repo.claim(claimArgs('a', later))).not.toBeNull()
  })

  it('schedules the next run from when it finished', async () => {
    const finished = new Date(NOW.getTime() + 300_000)
    await repo.release({ taskId: 'a', finishedAt: finished, success: true })

    const [row] = await db.select({ next: tasks.nextRunAt }).from(tasks)
    expect(row?.next?.toISOString()).toBe(new Date(finished.getTime() + 60_000).toISOString())
  })

  it('honours an explicit next run, which is how a cron schedule is respected', async () => {
    const nextRunAt = new Date('2026-08-31T09:00:00Z')
    await repo.release({ taskId: 'a', finishedAt: NOW, success: true, nextRunAt })

    const [row] = await db.select({ next: tasks.nextRunAt }).from(tasks)
    expect(row?.next?.toISOString()).toBe(nextRunAt.toISOString())
  })

  it('records a successful run in the log', async () => {
    await repo.release({
      taskId: 'a',
      finishedAt: NOW,
      success: true,
      detail: { lifted: 3 },
    })

    const [row] = await db.select().from(taskLog)
    expect(row?.succeeded).toBe(true)
    expect(row?.detail).toContain('lifted')
  })

  it('records the error text on failure', async () => {
    await repo.release({ taskId: 'a', finishedAt: NOW, success: false, error: 'boom' })

    const [row] = await db.select({ e: taskLog.error, ok: taskLog.succeeded }).from(taskLog)
    expect(row?.ok).toBe(false)
    expect(row?.e).toBe('boom')
  })

  it('counts consecutive failures and resets on success', async () => {
    await repo.release({ taskId: 'a', finishedAt: NOW, success: false, error: 'one' })

    const claimAgain = async (offsetMs: number) => {
      const at = new Date(NOW.getTime() + offsetMs)
      await repo.claim(claimArgs('a', at))
      return at
    }

    let at = await claimAgain(120_000)
    await repo.release({ taskId: 'a', finishedAt: at, success: false, error: 'two' })

    let [row] = await db.select({ f: tasks.consecutiveFailures }).from(tasks)
    expect(row?.f).toBe(2)

    at = await claimAgain(240_000)
    await repo.release({ taskId: 'a', finishedAt: at, success: true })

    ;[row] = await db.select({ f: tasks.consecutiveFailures }).from(tasks)
    expect(row?.f).toBe(0)
  })
})

describe('driven by the real scheduler', () => {
  function task(id: string, run: () => Promise<void>): TaskDefinition {
    return {
      id,
      title: id,
      description: id,
      intervalSeconds: 60,
      maxDurationSeconds: 30,
      async run() {
        await run()
        return {}
      },
    }
  }

  it('runs a due task once and records it', async () => {
    let runs = 0
    const outcomes = await tick({
      repository: repo,
      tasks: [task('demo', async () => void runs++)],
      now: NOW,
    })

    expect(runs).toBe(1)
    expect(outcomes[0]?.status).toBe('ran')
    expect(await db.select({ id: taskLog.id }).from(taskLog)).toHaveLength(1)
  })

  it('does not double-run under two concurrent ticks', async () => {
    let runs = 0
    const definitions = [task('demo', async () => void runs++)]

    await Promise.all([
      tick({ repository: repo, tasks: definitions, now: NOW }),
      tick({ repository: repo, tasks: definitions, now: NOW }),
    ])

    expect(runs).toBe(1)
  })

  it('records a throwing task as failed without killing the tick', async () => {
    const outcomes = await tick({
      repository: repo,
      tasks: [
        task('bad', async () => {
          throw new Error('task exploded')
        }),
      ],
      now: NOW,
    })

    expect(outcomes[0]?.status).toBe('failed')

    const [row] = await db.select({ ok: taskLog.succeeded, e: taskLog.error }).from(taskLog)
    expect(row?.ok).toBe(false)
    expect(row?.e).toContain('task exploded')
  })

  it('skips a task that is not yet due on the next tick', async () => {
    const definitions = [task('demo', async () => {})]
    await tick({ repository: repo, tasks: definitions, now: NOW })

    const soon = new Date(NOW.getTime() + 1000)
    const outcomes = await tick({ repository: repo, tasks: definitions, now: soon })
    expect(outcomes[0]?.status).toBe('skipped')
  })
})
