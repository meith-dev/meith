import { describe, expect, it, vi } from 'vitest'

import type {
  BackupOutcome,
  BackupRunFinish,
  BackupRunRecord,
  BackupRunRepository,
  BackupTrigger,
} from '@meith/backup'
import type { Database } from '@meith/db'

import type { BackupSettingsView } from './backup-plan'
import { backupWorker } from './backup-worker'

const NOW = new Date('2026-09-02T02:30:20Z')

const ENVIRONMENT = {
  DATABASE_URL: 'postgres://u:p@db/board',
  FILESTORE_DRIVER: 'local' as const,
  UPLOADS_DIR: '/tmp/uploads',
  BACKUP_DIR: '/tmp/backups',
}

function settings(overrides: Partial<BackupSettingsView> = {}): BackupSettingsView {
  return {
    schedule: { frequency: 'daily', hour: 2, minute: 30, weekday: 1 },
    retention: { keep: 7, keepDays: 0 },
    uploads: 'include',
    uploadsPreference: 'auto',
    beforeUpgrade: false,
    destination: { source: 'none', config: null, problem: null },
    ...overrides,
  }
}

class FakeRuns implements BackupRunRepository {
  rows: BackupRunRecord[] = []
  finished: { id: number; outcome: BackupRunFinish }[] = []
  heartbeats = 0
  interrupted = 0
  scheduledAt: Date | null = null
  private nextId = 1

  async enqueue(input: { trigger: BackupTrigger; now: Date }) {
    const pending = this.rows.find((row) => row.status === 'queued' || row.status === 'running')
    if (pending !== undefined) return { id: pending.id, queued: false }
    const id = this.nextId++
    this.rows.push({
      id,
      trigger: input.trigger,
      status: 'queued',
      requestedByUserId: null,
      requestedAt: input.now,
      startedAt: null,
      finishedAt: null,
      heartbeatAt: null,
      bundleName: null,
      sizeBytes: null,
      uploads: null,
      shipped: false,
      skippedKeys: 0,
      error: null,
    })
    return { id, queued: true }
  }

  async claimNext(now: Date) {
    if (this.rows.some((row) => row.status === 'running')) return null
    const next = this.rows.find((row) => row.status === 'queued')
    if (next === undefined) return null
    const running = { ...next, status: 'running' as const, startedAt: now }
    this.rows = this.rows.map((row) => (row.id === next.id ? running : row))
    return running
  }

  async heartbeat() {
    this.heartbeats += 1
  }

  async finish(id: number, outcome: BackupRunFinish) {
    this.finished.push({ id, outcome })
    this.rows = this.rows.map((row) => (row.id === id ? { ...row, status: outcome.status } : row))
  }

  async active() {
    return this.rows.find((row) => row.status === 'queued' || row.status === 'running') ?? null
  }

  async recent() {
    return this.rows
  }

  async lastScheduledAt() {
    return this.scheduledAt
  }

  async failInterrupted() {
    this.interrupted += 1
    return 0
  }

  async record() {}
}

function outcome(name: string, skipped: readonly string[] = []): BackupOutcome {
  return {
    path: `/tmp/backups/${name}`,
    name,
    size: 1234,
    createdAt: NOW,
    uploads: 'included',
    skippedKeys: skipped,
    shipped: null,
    prunedLocal: [],
    prunedRemote: [],
  }
}

function worker(runs: FakeRuns, view: BackupSettingsView, create = vi.fn()) {
  return {
    create,
    run: backupWorker({
      db: {} as Database,
      runs,
      environment: ENVIRONMENT,
      version: '0.33.4',
      settings: async () => view,
      create: create as never,
      clock: () => NOW,
    }),
  }
}

const context = (lastRunAt: Date | null) => ({
  now: NOW,
  lastRunAt,
  elapsedSeconds: 60,
  signal: new AbortController().signal,
})

describe('the backup worker', () => {
  it('does nothing when nothing is queued and the schedule is not due', async () => {
    const runs = new FakeRuns()
    const { run, create } = worker(
      runs,
      settings({ schedule: { frequency: 'off', hour: 2, minute: 30, weekday: 1 } }),
    )

    expect(await run(context(new Date('2026-09-02T02:29:20Z')))).toEqual({ ran: 0 })
    expect(create).not.toHaveBeenCalled()
    expect(runs.interrupted).toBe(1)
  })

  it('runs a queued manual backup and records the bundle', async () => {
    const runs = new FakeRuns()
    await runs.enqueue({ trigger: 'manual', now: NOW })
    const create = vi.fn(async () => outcome('meith-backup-2026-09-02T02-30-20Z.tar.gz'))
    const { run } = worker(runs, settings(), create)

    const result = await run(context(new Date('2026-09-02T02:29:20Z')))

    expect(result).toMatchObject({ ran: 1, trigger: 'manual', status: 'done' })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        uploads: 'include',
        target: expect.objectContaining({
          dir: '/tmp/backups',
          retention: { keep: 7, keepDays: 0 },
        }),
        source: expect.objectContaining({ databaseVariable: 'DATABASE_URL', filestore: 'local' }),
      }),
    )
    expect(runs.finished[0]?.outcome).toMatchObject({
      status: 'done',
      bundleName: 'meith-backup-2026-09-02T02-30-20Z.tar.gz',
      sizeBytes: 1234,
      shipped: false,
    })
  })

  it('queues and runs a scheduled backup when a slot fell since the last tick', async () => {
    const runs = new FakeRuns()
    const create = vi.fn(async () => outcome('x', ['attachments/./bad']))
    const { run } = worker(runs, settings(), create)

    const result = await run(context(new Date('2026-09-02T02:29:20Z')))

    expect(result).toMatchObject({ ran: 1, trigger: 'schedule', status: 'incomplete' })
    expect(runs.rows[0]).toMatchObject({ trigger: 'schedule', status: 'incomplete' })
    expect(runs.finished[0]?.outcome).toMatchObject({ status: 'incomplete', skippedKeys: 1 })
  })

  it('leaves a slot alone once a scheduled run already covered it', async () => {
    const runs = new FakeRuns()
    runs.scheduledAt = new Date('2026-09-02T02:30:05Z')
    const { run, create } = worker(runs, settings())

    expect(await run(context(new Date('2026-09-02T02:29:20Z')))).toEqual({ ran: 0 })
    expect(create).not.toHaveBeenCalled()
  })

  it('records a failure, and fails the task so administrators hear about it', async () => {
    const runs = new FakeRuns()
    await runs.enqueue({ trigger: 'manual', now: NOW })
    const create = vi.fn(async () => {
      throw new Error('pg_dump exited with code 1')
    })
    const { run } = worker(runs, settings(), create)

    await expect(run(context(null))).rejects.toThrow('The manual backup failed: pg_dump exited')
    expect(runs.finished[0]?.outcome).toMatchObject({
      status: 'failed',
      error: 'pg_dump exited with code 1',
    })
  })

  it('steps aside while another process is running a backup', async () => {
    const runs = new FakeRuns()
    await runs.enqueue({ trigger: 'manual', now: NOW })
    await runs.claimNext(NOW)
    const { run, create } = worker(runs, settings())

    expect(await run(context(null))).toEqual({ ran: 0, skipped: 'running' })
    expect(create).not.toHaveBeenCalled()
  })
})
