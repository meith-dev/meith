import {
  type BackupLog,
  type BackupOutcome,
  type BackupRunRecord,
  type BackupRunRepository,
  BackupShippingError,
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

export const BACKUP_LEASE_SECONDS = 10 * 60

export interface BackupWorkerDeps {
  readonly db: Database
  readonly runs: BackupRunRepository
  readonly environment: BackupEnvironment
  readonly version?: string | undefined
  readonly settings?: ((db: Database) => Promise<BackupSettingsView>) | undefined
  readonly create?: typeof createBackup | undefined
  readonly clock?: (() => Date) | undefined
  readonly renewLease?: ((now: Date) => Promise<void>) | undefined
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
    const now = clock()
    void deps.runs.heartbeat(run.id, now).catch(() => undefined)
    void deps.renewLease?.(now).catch(() => undefined)
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
    const bundle = error instanceof BackupShippingError ? error.bundle : null
    await deps.runs.finish(run.id, {
      status: 'failed',
      finishedAt: clock(),
      error: message,
      ...(bundle === null
        ? {}
        : {
            bundleName: bundle.name,
            sizeBytes: bundle.size,
            uploads: bundle.uploads,
            skippedKeys: bundle.skippedKeys.length,
          }),
    })
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
    await deps.runs.failInterrupted(now, new Date(now.getTime() - BACKUP_STALE_MS))

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

    const due = scheduledBackupDue(settings.schedule, {
      now,
      lastTickAt: context.lastRunAt,
      lastScheduledAt: await deps.runs.lastScheduledAt(),
    })
    let run = await deps.runs.claimNext(now)
    if (run === null) {
      if (due === null) return { ran: 0 }
      await deps.runs.enqueue({ trigger: 'schedule', now })
      run = await deps.runs.claimNext(now)
      if (run === null) return { ran: 0, skipped: 'claimed elsewhere' }
    }

    const { outcome, error } = await executeBackupRun(deps, run, settings)
    if (due !== null && run.trigger !== 'schedule') {
      await deps.runs.enqueue({ trigger: 'schedule', now })
    }
    if (error !== null) throw new Error(`The ${run.trigger} backup failed: ${error}`)

    return {
      ran: 1,
      trigger: run.trigger,
      bundle: outcome?.name ?? '',
      status: outcome !== null && outcome.skippedKeys.length > 0 ? 'incomplete' : 'done',
    }
  }
}
