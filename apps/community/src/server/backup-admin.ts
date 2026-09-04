import 'server-only'

import { stat } from 'node:fs/promises'
import path from 'node:path'

import {
  type BackupCapability,
  type BackupDestination,
  type BackupRunRecord,
  backupCapability,
  backupDestinationFromEnv,
  bundleTakenAt,
  isBundleName,
  localBundles,
  nextSlotAfter,
} from '@meith/backup'
import { env, ForbiddenError, logger } from '@meith/core'
import { getDb, PostgresBackupRunRepository } from '@meith/db'
import { msg } from '@meith/i18n'
import {
  BACKUP_STALE_MS,
  type BackupSettingsView,
  backupDestinationFor,
  backupRingDirectory,
  loadBackupSettings,
} from '@meith/runtime'

import { getContainer } from './container'

export interface BackupBundleRow {
  readonly name: string
  readonly takenAt: Date | null
  readonly localSize: number | null
  readonly remoteSize: number | null
}

export interface BackupDestinationView {
  readonly source: 'environment' | 'board' | 'none'
  readonly description: string | null
  readonly problem: string | null
  readonly listError: string | null
}

export interface BackupAdminView {
  readonly capability: BackupCapability
  readonly ring: string
  readonly destination: BackupDestinationView
  readonly bundles: readonly BackupBundleRow[]
  readonly runs: readonly BackupRunRecord[]
  readonly active: BackupRunRecord | null
  readonly settings: BackupSettingsView
  readonly nextScheduled: Date | null
}

const RECENT_RUNS = 10

export function backupRuns(): PostgresBackupRunRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresBackupRunRepository(getDb()) : null
}

export function requireBackupRuns(): PostgresBackupRunRepository {
  const runs = backupRuns()
  if (runs === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-6'))
  }
  return runs
}

export function backupRing(): string {
  return backupRingDirectory(env)
}

export function backupsAvailable(): BackupCapability {
  return backupCapability(env)
}

export function destinationIsFromEnvironment(): boolean {
  try {
    return backupDestinationFromEnv(env) !== undefined
  } catch {
    return true
  }
}

export async function currentBackupSettings(): Promise<BackupSettingsView> {
  return loadBackupSettings(getDb(), env)
}

export function destinationFor(settings: BackupSettingsView): BackupDestination | undefined {
  return backupDestinationFor(settings.destination)
}

export async function localBundlePath(name: string): Promise<string | null> {
  if (!isBundleName(name)) return null
  const file = path.join(backupRing(), name)
  const info = await stat(file).catch(() => null)
  return info?.isFile() ? file : null
}

async function mergedBundles(
  ring: string,
  destination: BackupDestination | undefined,
): Promise<{ readonly bundles: readonly BackupBundleRow[]; readonly listError: string | null }> {
  const local = await localBundles(ring)
  const rows = new Map<string, { localSize: number | null; remoteSize: number | null }>()
  for (const bundle of local) rows.set(bundle.name, { localSize: bundle.size, remoteSize: null })

  let listError: string | null = null
  if (destination !== undefined) {
    try {
      for (const bundle of await destination.list()) {
        const row = rows.get(bundle.name)
        if (row === undefined) rows.set(bundle.name, { localSize: null, remoteSize: bundle.size })
        else rows.set(bundle.name, { ...row, remoteSize: bundle.size })
      }
    } catch (error) {
      listError = error instanceof Error ? error.message : String(error)
      logger({ module: 'backup' }).warn({ err: listError }, 'could not list the off-site backups')
    }
  }

  const bundles = [...rows]
    .map(([name, sizes]) => ({ name, takenAt: bundleTakenAt(name), ...sizes }))
    .sort((a, b) => b.name.localeCompare(a.name))
  return { bundles, listError }
}

export async function buildBackupAdminView(now: Date): Promise<BackupAdminView | null> {
  const runs = backupRuns()
  if (runs === null) return null

  const settings = await currentBackupSettings()
  const destination = destinationFor(settings)
  const ring = backupRing()

  const [{ bundles, listError }, recent, active] = await Promise.all([
    mergedBundles(ring, destination),
    runs.recent(RECENT_RUNS),
    runs.active(now, new Date(now.getTime() - BACKUP_STALE_MS)),
  ])

  return {
    capability: backupsAvailable(),
    ring,
    destination: {
      source: settings.destination.source,
      description: destination?.description ?? null,
      problem: settings.destination.problem,
      listError,
    },
    bundles,
    runs: recent,
    active,
    settings,
    nextScheduled: nextSlotAfter(settings.schedule, now),
  }
}
