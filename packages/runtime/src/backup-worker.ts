import {
  type BackupLog,
  type BackupOutcome,
  type BackupRunRecord,
  type BackupRunRepository,
  createBackup,
  scheduledBackupDue,
} from '@meith/backup'
import { logger } from '@meith/core'
import type { Database } from '@meith/db'
import type { BackupTaskOutcome, TaskContext } from '@meith/tasks'

import {
  type BackupEnvironment,
  type BackupSettingsView,
  backupDestinationFor,
  backupRingDirectory,
  backupSourceFrom,
  loadBackupSettings,
} from './backup-plan'

export const BACKUP_HEARTBEAT_MS = 30_000

export const BACKUP_STALE_MS = 5 * 60_000

export const BACKUP_INTERRUPTED_AFTER_MS = 6 * 60 * 60_000

export interface BackupWorkerDeps {
  readonly db: Database
  readonly runs: BackupRunRepository
  readonly environment: BackupEnvironment
  readonly version?: string | undefined
  readonly settings?: ((db: Database) => Promise<BackupSettingsView>) | undefined
  readonly create?: typeof createBackup | undefined
  readonly clock?: (() => Date) | undefined
}

export function backupLog(): BackupLog {
  const log = logger({ module: 'backup' })
  return {
    info: (line) => log.info(line),
    warn: (line) => log.warn(line),
  }
}

export async function executeBackupRun(
  deps: BackupWorkerDeps,
  run: BackupRunRecord,
  settings: BackupSettingsView,
): Promise<{ readonly outcome: BackupOutcome | null; readonly error: string | null }> {
  const clock = deps.clock ?? (() => new Date())
  const create = deps.create ?? createBackup
  const heartbeat = setInterval(() => {
    void deps.runs.heartbeat(run.id, clock()).catch(() => undefined)
  }, BACKUP_HEARTBEAT_MS)

  try {
    const outcome = await create({
      source: backupSourceFrom(deps.environment, deps.version),
      target: {
        dir: backupRingDirectory(deps.environment),
        destination: backupDestinationFor(settings.destination),
        retention: settings.retention,
      },
      uploads: settings.uploads,
      now: clock(),
      log: backupLog(),
    })
    await deps.runs.finish(run.id, {
      status: outcome.skippedKeys.length === 0 ? 'done' : 'incomplete',
      finishedAt: clock(),
      bundleName: outcome.name,
      sizeBytes: outcome.size,
      uploads: outcome.uploads,
      shipped: outcome.shipped !== null,
      skippedKeys: outcome.skippedKeys.length,
    })
    return { outcome, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await deps.runs.finish(run.id, { status: 'failed', finishedAt: clock(), error: message })
    return { outcome: null, error: message }
  } finally {
    clearInterval(heartbeat)
  }
}

export function backupWorker(
  deps: BackupWorkerDeps,
): (context: TaskContext) => Promise<BackupTaskOutcome> {
  const clock = deps.clock ?? (() => new Date())
  const loadSettings = deps.settings ?? ((db: Database) => loadBackupSettings(db, deps.environment))

  return async (context) => {
    const now = clock()
    await deps.runs.failInterrupted(now, new Date(now.getTime() - BACKUP_INTERRUPTED_AFTER_MS))

    const active = await deps.runs.active(now, new Date(now.getTime() - BACKUP_STALE_MS))
    if (active !== null && active.status === 'running') {
      return { ran: 0, skipped: 'running' }
    }

    const settings = await loadSettings(deps.db)
    if (settings.destination.problem !== null) {
      logger({ module: 'backup' }).warn(
        { problem: settings.destination.problem },
        'the off-site backup destination is misconfigured; bundles stay on the server',
      )
    }

    let run = await deps.runs.claimNext(now)
    if (run === null) {
      const due = scheduledBackupDue(settings.schedule, {
        now,
        lastTickAt: context.lastRunAt,
        lastScheduledAt: await deps.runs.lastScheduledAt(),
      })
      if (due === null) return { ran: 0 }
      await deps.runs.enqueue({ trigger: 'schedule', now })
      run = await deps.runs.claimNext(now)
      if (run === null) return { ran: 0, skipped: 'claimed elsewhere' }
    }

    const { outcome, error } = await executeBackupRun(deps, run, settings)
    if (error !== null) throw new Error(`The ${run.trigger} backup failed: ${error}`)
    return {
      ran: 1,
      trigger: run.trigger,
      bundle: outcome?.name ?? '',
      status: outcome !== null && outcome.skippedKeys.length > 0 ? 'incomplete' : 'done',
    }
  }
}
