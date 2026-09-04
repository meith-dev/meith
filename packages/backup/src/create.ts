import { chmod, mkdir, mkdtemp, open, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { ValidationError } from '@meith/core'

import {
  type BackupManifest,
  bundleName,
  type FilestoreDriver,
  formatBytes,
  isBundleName,
  type UploadsMode,
} from './bundle'
import type { BackupDestination } from './destination'
import { postgresClientEnvironment, run } from './postgres-client'
import { type RetentionPolicy, retentionCandidates } from './retention'
import { drainStoreToDirectory, type ListableStore } from './uploads'

export interface BackupLog {
  info(line: string): void
  warn(line: string): void
}

export const SILENT_LOG: BackupLog = { info: () => undefined, warn: () => undefined }

export interface BackupSource {
  readonly databaseUrl: string
  readonly databaseVariable: string
  readonly version: string
  readonly filestore: FilestoreDriver
  readonly uploadsDir: string
  readonly objectStore?:
    | { readonly store: ListableStore; readonly origin: string; readonly bucket?: string }
    | undefined
}

export interface BackupTarget {
  readonly out?: string | undefined
  readonly dir?: string | undefined
  readonly destination?: BackupDestination | undefined
  readonly retention: RetentionPolicy
}

export interface CreateBackupInput {
  readonly source: BackupSource
  readonly target: BackupTarget
  readonly uploads: UploadsMode
  readonly now?: Date | undefined
  readonly log?: BackupLog | undefined
  readonly translateWriteError?: ((error: unknown, destination: string) => never) | undefined
}

export interface BackupOutcome {
  readonly path: string
  readonly name: string
  readonly size: number
  readonly createdAt: Date
  readonly uploads: 'included' | 'skipped'
  readonly skippedKeys: readonly string[]
  readonly shipped: string | null
  readonly prunedLocal: readonly string[]
  readonly prunedRemote: readonly string[]
}

export interface WrittenBundle {
  readonly name: string
  readonly size: number
  readonly uploads: 'included' | 'skipped'
  readonly skippedKeys: readonly string[]
}

export class BackupShippingError extends Error {
  constructor(
    cause: unknown,
    readonly bundle: WrittenBundle,
  ) {
    super(
      `${bundle.name} was written but not shipped: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
    this.name = 'BackupShippingError'
  }
}

export async function reserveBackupDestination(destination: string): Promise<void> {
  const file = await open(destination, 'wx', 0o600)
  await file.close()
}

export async function claimBackupDestination(
  destination: string,
  translateWriteError?: (error: unknown, destination: string) => never,
): Promise<void> {
  try {
    await reserveBackupDestination(destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST') {
      throw new ValidationError(
        `backup will not write over ${destination}: something is already there. Move it aside ` +
          'or pass a different --out. A previous run killed part-way through can leave an ' +
          'empty or truncated bundle at the path it had claimed; that file is not a backup ' +
          'and is safe to delete.',
      )
    }
    if (translateWriteError !== undefined) translateWriteError(error, destination)
    throw error
  }
}

interface StagedUploads {
  readonly uploads: 'included' | 'skipped'
  readonly skippedKeys: readonly string[]
}

async function stageLocalUploads(
  stage: string,
  uploadsDir: string,
  log: BackupLog,
): Promise<StagedUploads> {
  const exists = await stat(uploadsDir).then(
    (info) => info.isDirectory(),
    () => false,
  )
  if (!exists) {
    log.info(`No uploads directory at ${uploadsDir}; the bundle carries none.`)
    return { uploads: 'skipped', skippedKeys: [] }
  }

  await run('tar', ['czf', path.join(stage, 'uploads.tar.gz'), '-C', uploadsDir, '.'])
  return { uploads: 'included', skippedKeys: [] }
}

async function stageObjectStoreUploads(
  stage: string,
  store: ListableStore,
  origin: string,
  log: BackupLog,
): Promise<StagedUploads> {
  const dir = path.join(stage, 'uploads')
  await mkdir(dir, { recursive: true })

  const { pulled, skipped } = await drainStoreToDirectory(store, dir, (line) => log.warn(line))

  if (pulled === 0) {
    log.info(`Found no objects in ${origin}; the bundle carries no uploads.`)
    await rm(dir, { recursive: true, force: true })
    return { uploads: 'skipped', skippedKeys: skipped }
  }

  await run('tar', ['czf', path.join(stage, 'uploads.tar.gz'), '-C', dir, '.'])
  await rm(dir, { recursive: true, force: true })
  log.info(`Pulled ${pulled} object(s) from ${origin}.`)
  return { uploads: 'included', skippedKeys: skipped }
}

async function stageUploads(
  stage: string,
  source: BackupSource,
  mode: UploadsMode,
  log: BackupLog,
): Promise<StagedUploads> {
  if (mode === 'skip') return { uploads: 'skipped', skippedKeys: [] }

  if (source.filestore === 'local') return stageLocalUploads(stage, source.uploadsDir, log)

  if (source.objectStore === undefined) {
    throw new ValidationError(
      `The uploads live in a ${source.filestore} store and no store was given to read them from.`,
    )
  }
  return stageObjectStoreUploads(stage, source.objectStore.store, source.objectStore.origin, log)
}

export async function createBackup(input: CreateBackupInput): Promise<BackupOutcome> {
  const log = input.log ?? SILENT_LOG
  const { source, target } = input
  if (target.out !== undefined && target.dir !== undefined) {
    throw new ValidationError('--out and --dir are two answers to one question; pass one.')
  }

  const now = input.now ?? new Date()
  const name = bundleName(now)
  if (target.dir !== undefined) await mkdir(path.resolve(target.dir), { recursive: true })
  const out = path.resolve(
    target.dir === undefined ? (target.out ?? name) : path.join(target.dir, name),
  )

  const stage = await mkdtemp(path.join(tmpdir(), 'meith-backup-'))
  let destinationCreated = false
  try {
    await claimBackupDestination(out, input.translateWriteError)
    destinationCreated = true

    log.info(
      source.databaseVariable === 'DIRECT_DATABASE_URL'
        ? 'Dumping the database over DIRECT_DATABASE_URL…'
        : 'Dumping the database…',
    )
    const databaseEnvironment = postgresClientEnvironment(
      source.databaseUrl,
      source.databaseVariable,
    )
    await run(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-privileges', '--file', path.join(stage, 'db.dump')],
      databaseEnvironment,
    )

    const { uploads, skippedKeys } = await stageUploads(stage, source, input.uploads, log)

    const bucket = source.objectStore?.bucket
    const manifest: BackupManifest = {
      format: 1,
      createdAt: now.toISOString(),
      version: source.version,
      filestore: source.filestore,
      uploads,
      ...(bucket === undefined ? {} : { bucket }),
      ...(skippedKeys.length === 0 ? {} : { skippedKeys }),
    }
    await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    const members = ['manifest.json', 'db.dump']
    if (uploads === 'included') members.push('uploads.tar.gz')
    await run('tar', ['czf', out, '-C', stage, ...members])
    await chmod(out, 0o600)

    const size = (await stat(out)).size
    destinationCreated = false
    log.info(
      `Wrote ${out} (${formatBytes(size)}): the database dump${
        uploads === 'included' ? ' and the uploads' : ', no uploads'
      }.`,
    )
    if (uploads === 'skipped' && source.filestore === 's3' && input.uploads !== 'include') {
      log.info(
        'The S3 bucket was not pulled — it has its own backup story. ' +
          'Run with --uploads include for a bundle that carries every object.',
      )
    }
    if (uploads === 'skipped' && input.uploads === 'skip') {
      log.info('Restoring this bundle gives a board whose posts have broken images.')
    }

    let shipped: string | null = null
    let prunedRemote: readonly string[] = []
    if (target.destination !== undefined) {
      try {
        await target.destination.putFile(name, out, size)
        shipped = target.destination.description
        log.info(`Shipped ${name} to ${shipped}.`)
        prunedRemote = await target.destination.prune(target.retention, now)
      } catch (error) {
        throw new BackupShippingError(error, { name, size, uploads, skippedKeys })
      }
      if (prunedRemote.length > 0) {
        log.info(
          `Pruned ${prunedRemote.length} bundle(s) there beyond the retention policy: ` +
            `${prunedRemote.join(', ')}.`,
        )
      }
    } else {
      log.info(
        'Copy the bundle off this machine: a backup on the server is a backup of the ' +
          'thing most likely to fail.',
      )
    }

    let prunedLocal: readonly string[] = []
    if (target.dir !== undefined) {
      const dir = path.resolve(target.dir)
      prunedLocal = retentionCandidates(await readdir(dir), target.retention, now)
      for (const staleName of prunedLocal) await rm(path.join(dir, staleName), { force: true })
      if (prunedLocal.length > 0) {
        log.info(
          `Pruned ${prunedLocal.length} bundle(s) in ${dir} beyond the retention policy: ` +
            `${prunedLocal.join(', ')}.`,
        )
      }
    }

    return {
      path: out,
      name,
      size,
      createdAt: now,
      uploads,
      skippedKeys,
      shipped,
      prunedLocal,
      prunedRemote,
    }
  } finally {
    if (destinationCreated) await rm(out, { force: true })
    await rm(stage, { recursive: true, force: true })
  }
}

export interface LocalBundle {
  readonly name: string
  readonly size: number
}

export async function localBundles(dir: string): Promise<readonly LocalBundle[]> {
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const bundles: LocalBundle[] = []
  for (const name of names.filter((entry) => isBundleName(entry)).sort()) {
    bundles.push({ name, size: (await stat(path.join(dir, name))).size })
  }
  return bundles
}
