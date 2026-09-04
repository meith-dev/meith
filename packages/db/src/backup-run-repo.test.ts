import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PostgresBackupRunRepository } from './backup-run-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { backupRuns } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresBackupRunRepository

const NOW = new Date('2026-09-02T02:30:00Z')

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000)
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresBackupRunRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(backupRuns)
})

describe('queueing a backup', () => {
  it('queues one run and folds a second request into it', async () => {
    const first = await repo.enqueue({ trigger: 'manual', requestedByUserId: null, now: NOW })
    const second = await repo.enqueue({ trigger: 'schedule', now: minutesFromNow(1) })

    expect(first.queued).toBe(true)
    expect(second).toEqual({ id: first.id, queued: false })
    expect(await repo.active(NOW, minutesFromNow(-10))).toMatchObject({
      id: first.id,
      trigger: 'manual',
      status: 'queued',
    })
  })

  it('claims the oldest queued run, one at a time, and records the outcome', async () => {
    const { id } = await repo.enqueue({ trigger: 'manual', now: NOW })

    const claimed = await repo.claimNext(minutesFromNow(1))
    expect(claimed).toMatchObject({ id, status: 'running', startedAt: minutesFromNow(1) })
    expect(await repo.claimNext(minutesFromNow(2))).toBeNull()

    await repo.heartbeat(id, minutesFromNow(2))
    expect((await repo.active(minutesFromNow(2), minutesFromNow(-10)))?.heartbeatAt).toEqual(
      minutesFromNow(2),
    )

    await repo.finish(id, {
      status: 'done',
      finishedAt: minutesFromNow(3),
      bundleName: 'meith-backup-2026-09-02T02-31-00Z.tar.gz',
      sizeBytes: 12_345,
      uploads: 'included',
      shipped: true,
    })

    const [run] = await repo.recent(5)
    expect(run).toMatchObject({
      id,
      status: 'done',
      bundleName: 'meith-backup-2026-09-02T02-31-00Z.tar.gz',
      sizeBytes: 12_345,
      uploads: 'included',
      shipped: true,
      skippedKeys: 0,
      error: null,
    })
    expect(await repo.active(minutesFromNow(4), minutesFromNow(-10))).toBeNull()
  })

  it('lets a new request in once the running one is done', async () => {
    const first = await repo.enqueue({ trigger: 'manual', now: NOW })
    await repo.claimNext(NOW)
    expect((await repo.enqueue({ trigger: 'manual', now: NOW })).queued).toBe(false)
    await repo.finish(first.id, { status: 'failed', finishedAt: NOW, error: 'pg_dump exited' })

    const second = await repo.enqueue({ trigger: 'manual', now: minutesFromNow(1) })
    expect(second.queued).toBe(true)
    expect(second.id).not.toBe(first.id)
  })
})

describe('interrupted and scheduled runs', () => {
  it('fails a running row whose heartbeat has gone stale, and leaves a fresh one', async () => {
    const stale = await repo.enqueue({ trigger: 'schedule', now: minutesFromNow(-120) })
    await repo.claimNext(minutesFromNow(-120))
    await repo.finish(stale.id, { status: 'failed', finishedAt: minutesFromNow(-119) })

    const interrupted = await repo.enqueue({ trigger: 'manual', now: minutesFromNow(-100) })
    await repo.claimNext(minutesFromNow(-100))

    expect(await repo.failInterrupted(NOW, minutesFromNow(-60))).toBe(1)
    expect((await repo.recent(5)).find((run) => run.id === interrupted.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('interrupted'),
    })

    const fresh = await repo.enqueue({ trigger: 'manual', now: NOW })
    await repo.claimNext(NOW)
    expect(await repo.failInterrupted(minutesFromNow(1), minutesFromNow(-60))).toBe(0)
    expect(await repo.active(minutesFromNow(1), minutesFromNow(-60))).toMatchObject({
      id: fresh.id,
      status: 'running',
    })
  })

  it('remembers when the schedule last fired, whatever became of the run', async () => {
    expect(await repo.lastScheduledAt()).toBeNull()

    await repo.record({
      trigger: 'cli',
      startedAt: minutesFromNow(-30),
      outcome: { status: 'done', finishedAt: minutesFromNow(-29), bundleName: 'x' },
    })
    expect(await repo.lastScheduledAt()).toBeNull()

    const scheduled = await repo.enqueue({ trigger: 'schedule', now: minutesFromNow(-5) })
    await repo.claimNext(minutesFromNow(-5))
    await repo.finish(scheduled.id, { status: 'failed', finishedAt: minutesFromNow(-4) })
    expect(await repo.lastScheduledAt()).toEqual(minutesFromNow(-5))
  })

  it('records a run that happened elsewhere, newest first in the listing', async () => {
    await repo.record({
      trigger: 'upgrade',
      startedAt: minutesFromNow(-2),
      outcome: {
        status: 'incomplete',
        finishedAt: minutesFromNow(-1),
        bundleName: 'meith-backup-2026-09-02T02-28-00Z.tar.gz',
        sizeBytes: 10,
        uploads: 'skipped',
        skippedKeys: 2,
      },
    })
    await repo.enqueue({ trigger: 'manual', now: NOW })

    const runs = await repo.recent(5)
    expect(runs.map((run) => run.trigger)).toEqual(['manual', 'upgrade'])
    expect(runs[1]).toMatchObject({ status: 'incomplete', skippedKeys: 2, uploads: 'skipped' })
  })
})
