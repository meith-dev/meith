import 'server-only'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  type BackupDestination,
  backupCapability,
  backupDestinationFromEnv,
  bundleTakenAt,
  isBundleName,
  localBundles,
  openBackupDestination,
  type RestoreUploadsPlan,
  restoreBackup,
  restoreLimits,
} from '@meith/backup'
import { env, GLOBAL_TAGS, logger, processEnvironment, ValidationError } from '@meith/core'
import {
  countUsers,
  getDb,
  isInstalled,
  migrationUrl,
  runMigrations,
  withInstallLock,
} from '@meith/db'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'
import { backupRingDirectory } from '@meith/runtime'

import { CODE_VERSION } from './upgrade-notice'

export interface RestoreCandidate {
  readonly name: string
  readonly takenAt: Date | null
  readonly size: number
  readonly location: 'server' | 'off-site'
}

export interface InstallRestoreView {
  readonly possible: boolean
  readonly candidates: readonly RestoreCandidate[]
  readonly ring: string
  readonly destination: string | null
  readonly problem: string | null
}

function offSiteDestination(): { destination: BackupDestination | null; problem: string | null } {
  try {
    const config = backupDestinationFromEnv(env)
    return {
      destination: config === undefined ? null : openBackupDestination(config),
      problem: null,
    }
  } catch (error) {
    return { destination: null, problem: error instanceof Error ? error.message : String(error) }
  }
}

export async function installRestoreView(): Promise<InstallRestoreView> {
  const ring = backupRingDirectory(env)
  if (backupCapability(env) !== 'available') {
    return { possible: false, candidates: [], ring, destination: null, problem: null }
  }

  const { destination, problem } = offSiteDestination()
  const candidates: RestoreCandidate[] = []
  const seen = new Set<string>()

  for (const bundle of await localBundles(ring).catch(() => [])) {
    seen.add(bundle.name)
    candidates.push({ ...bundle, takenAt: bundleTakenAt(bundle.name), location: 'server' })
  }

  let listProblem = problem
  if (destination !== null) {
    try {
      for (const bundle of await destination.list()) {
        if (seen.has(bundle.name)) continue
        candidates.push({ ...bundle, takenAt: bundleTakenAt(bundle.name), location: 'off-site' })
      }
    } catch (error) {
      listProblem = error instanceof Error ? error.message : String(error)
      logger().warn({ err: listProblem }, 'the installer could not list the off-site backups')
    }
  }

  return {
    possible: true,
    candidates: candidates.sort((a, b) => b.name.localeCompare(a.name)),
    ring,
    destination: destination?.description ?? null,
    problem: listProblem,
  }
}

function uploadsPlan(): RestoreUploadsPlan {
  switch (env.FILESTORE_DRIVER) {
    case 's3':
      return { mode: 'store', store: drivers().files, description: `the ${env.S3_BUCKET} bucket` }
    case 'blob':
      return { mode: 'store', store: drivers().files, description: 'the Blob store' }
    default:
      return { mode: 'directory', dir: env.UPLOADS_DIR }
  }
}

export interface InstallRestoreOutcome {
  readonly bundle: string
  readonly version: string
  readonly posts: number
  readonly migrationsApplied: number
  readonly uploads: 'restored' | 'pushed' | 'skipped' | 'none'
  readonly skippedKeys: number
}

export type InstallRestoreRun =
  | { readonly sealed: true }
  | { readonly outcome: InstallRestoreOutcome }
  | { readonly busy: true }

async function fetchCandidate(name: string, stage: string): Promise<string> {
  const local = path.join(backupRingDirectory(env), name)
  const known = await localBundles(backupRingDirectory(env)).catch(() => [])
  if (known.some((bundle) => bundle.name === name)) return local

  const { destination, problem } = offSiteDestination()
  if (destination === null) {
    throw new ValidationError(problem ?? msg('error.app.no-such-bundle').text)
  }
  const fetched = path.join(stage, name)
  await destination.getToFile(name, fetched)
  return fetched
}

export async function runInstallRestore(name: string): Promise<InstallRestoreRun> {
  if (!isBundleName(name)) throw new ValidationError(msg('error.app.not-a-backup-bundle-name'))
  if (backupCapability(env) !== 'available') {
    throw new ValidationError(msg('error.app.backups-not-on-this-deployment'))
  }

  const url = migrationUrl(env)
  const stage = await mkdtemp(path.join(tmpdir(), 'meith-install-restore-'))
  try {
    const run = await withInstallLock(url, async (): Promise<InstallRestoreRun> => {
      const db = getDb()
      if (await isInstalled(db)) return { sealed: true }
      const members = await countUsers(db)
      if (members !== null && members > 0) {
        throw new ValidationError(msg('error.app.restore-needs-empty-board'))
      }

      const bundle = await fetchCandidate(name, stage)
      const log = logger({ module: 'install-restore' })
      const outcome = await restoreBackup({
        bundle,
        target: { url, variable: 'DATABASE_URL', mode: 'reset-schema' },
        codeVersion: CODE_VERSION,
        migrate: (target) => runMigrations({ url: target }),
        uploads: uploadsPlan(),
        limits: restoreLimits(processEnvironment()),
        log: { info: (line) => log.info(line), warn: (line) => log.warn(line) },
      })

      return {
        outcome: {
          bundle: name,
          version: outcome.manifest.version,
          posts: outcome.posts,
          migrationsApplied: outcome.migrationsApplied,
          uploads: outcome.uploads,
          skippedKeys: outcome.manifest.skippedKeys?.length ?? 0,
        },
      }
    })
    return run ?? { busy: true }
  } finally {
    await rm(stage, { recursive: true, force: true })
    try {
      await drivers().cache.invalidateTags(GLOBAL_TAGS)
    } catch (error) {
      logger().warn({ err: String(error) }, 'restore could not clear the cache; restart the server')
    }
  }
}
