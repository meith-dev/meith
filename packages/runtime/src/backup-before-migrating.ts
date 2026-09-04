import { type BackupRunFinish, BackupShippingError, createBackup } from '@meith/backup'
import { assertEnv, logger } from '@meith/core'
import { getDb, isInstalled, PostgresBackupRunRepository, pendingCoreMigrations } from '@meith/db'

import {
  backupDestinationFor,
  backupRingDirectory,
  backupSourceFrom,
  loadBackupSettings,
} from './backup-plan'
import { backupLog } from './backup-worker'

const log = () => logger({ module: 'migrate' })

export async function backupBeforeMigrating(): Promise<'taken' | 'skipped'> {
  const env = assertEnv()
  const db = getDb()

  let pending: readonly string[]
  try {
    pending = await pendingCoreMigrations(db)
  } catch (err) {
    log().info({ err: String(err) }, 'could not count pending migrations; taking no backup first')
    return 'skipped'
  }
  if (pending.length === 0) return 'skipped'

  let wanted = false
  let settings: Awaited<ReturnType<typeof loadBackupSettings>> | null = null
  try {
    if (await isInstalled(db)) {
      settings = await loadBackupSettings(db, env)
      wanted = settings.beforeUpgrade
    }
  } catch (err) {
    log().info({ err: String(err) }, 'could not read the backup settings; taking no backup first')
    return 'skipped'
  }
  if (!wanted || settings === null) return 'skipped'

  log().info({ pending: pending.length }, 'taking a backup before the pending migrations')
  const startedAt = new Date()
  const runs = new PostgresBackupRunRepository(db)
  const record = async (outcome: BackupRunFinish): Promise<void> => {
    try {
      await runs.record({ trigger: 'upgrade', startedAt, outcome })
    } catch (err) {
      log().warn({ err: String(err) }, 'could not record the pre-migration backup')
    }
  }

  try {
    const outcome = await createBackup({
      source: backupSourceFrom(env),
      target: {
        dir: backupRingDirectory(env),
        destination: backupDestinationFor(settings.destination),
        retention: settings.retention,
      },
      uploads: settings.uploads,
      log: backupLog(),
    })
    await record({
      status: outcome.skippedKeys.length === 0 ? 'done' : 'incomplete',
      finishedAt: new Date(),
      bundleName: outcome.name,
      sizeBytes: outcome.size,
      uploads: outcome.uploads,
      shipped: outcome.shipped !== null,
      skippedKeys: outcome.skippedKeys.length,
    })
    log().info({ bundle: outcome.name }, 'pre-migration backup written')
    return 'taken'
  } catch (err) {
    const bundle = err instanceof BackupShippingError ? err.bundle : null
    await record({
      status: 'failed',
      finishedAt: new Date(),
      error: err instanceof Error ? err.message : String(err),
      ...(bundle === null
        ? {}
        : {
            bundleName: bundle.name,
            sizeBytes: bundle.size,
            uploads: bundle.uploads,
            skippedKeys: bundle.skippedKeys.length,
          }),
    })
    throw err
  }
}
