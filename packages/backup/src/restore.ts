import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { FileStore } from '@meith/core'
import { ValidationError } from '@meith/core'
import { compareVersions } from '@meith/upgrade'

import { inspectArchive, type RestoreLimits } from './archive'
import { type BackupManifest, parseManifest } from './bundle'
import { type BackupLog, SILENT_LOG } from './create'
import { postgresClientEnvironment, run } from './postgres-client'
import { uploadDirectoryToStore } from './uploads'

export type RestoreTargetMode = 'empty-database' | 'reset-schema'

export interface RestoreTarget {
  readonly url: string
  readonly variable: string
  readonly mode: RestoreTargetMode
}

export type RestoreUploadsPlan =
  | { readonly mode: 'skip' }
  | { readonly mode: 'directory'; readonly dir: string }
  | {
      readonly mode: 'store'
      readonly store: { put: FileStore['put'] }
      readonly description: string
    }

export interface RestoreInput {
  readonly bundle: string
  readonly target: RestoreTarget
  readonly codeVersion: string
  readonly migrate: (url: string) => Promise<number>
  readonly uploads: RestoreUploadsPlan
  readonly limits: RestoreLimits
  readonly log?: BackupLog | undefined
}

export interface RestoreOutcome {
  readonly manifest: BackupManifest
  readonly migrationsApplied: number
  readonly posts: number
  readonly uploads: 'restored' | 'pushed' | 'skipped' | 'none'
  readonly pushed: number
}

export function versionRefusal(manifestVersion: string, codeVersion: string): string | null {
  let order: number
  try {
    order = compareVersions(manifestVersion, codeVersion)
  } catch {
    return null
  }
  if (order <= 0) return null
  return (
    `This bundle was taken by version ${manifestVersion} and this build is ${codeVersion}. ` +
    'Migrations are forward-only, so a newer dump cannot be restored into older code: ' +
    'deploy that version or newer first, then restore.'
  )
}

async function validateUploadsArchive(stage: string, limits: RestoreLimits): Promise<void> {
  const members = await inspectArchive(
    path.join(stage, 'uploads.tar.gz'),
    limits,
    new Set(['-', 'd']),
  )
  for (const member of members) {
    if (member.name === '.' && member.type !== 'd') {
      throw new ValidationError('The uploads archive root is not a directory.')
    }
  }
}

async function extractUploads(
  stage: string,
  dir: string,
  limits: RestoreLimits,
  log: BackupLog,
): Promise<void> {
  await validateUploadsArchive(stage, limits)
  const existing = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (existing !== undefined && existing.length > 0) {
    throw new ValidationError(
      `${dir} is not empty. Restore the uploads into a fresh directory (--uploads-dir), ` +
        'the same way the database goes into a fresh database.',
    )
  }

  await mkdir(dir, { recursive: true })
  await run('tar', ['xzf', path.join(stage, 'uploads.tar.gz'), '-C', dir])
  log.info(`Restored the uploads into ${dir}.`)
}

async function pushUploadsToStore(
  stage: string,
  limits: RestoreLimits,
  store: { put: FileStore['put'] },
  description: string,
  log: BackupLog,
): Promise<number> {
  await validateUploadsArchive(stage, limits)
  const dir = path.join(stage, 'uploads-extract')
  await mkdir(dir, { recursive: true })
  await run('tar', ['xzf', path.join(stage, 'uploads.tar.gz'), '-C', dir])

  const pushed = await uploadDirectoryToStore(store, dir)
  log.info(`Uploaded ${pushed} object(s) to ${description}.`)
  return pushed
}

const RESET_SCHEMA_SQL = [
  'drop schema if exists drizzle cascade;',
  'drop schema if exists public cascade;',
  'create schema public;',
].join('\n')

async function prepareTarget(
  target: RestoreTarget,
  databaseEnvironment: NodeJS.ProcessEnv,
  log: BackupLog,
): Promise<void> {
  const tables = (
    await run(
      'psql',
      ['-tAc', "select count(*) from information_schema.tables where table_schema = 'public'"],
      databaseEnvironment,
    )
  ).trim()

  if (target.mode === 'empty-database') {
    if (tables !== '0') {
      throw new ValidationError(
        `The target database already holds ${tables} table(s). Restore into a new, ` +
          'empty database — a restore over a live board is how a bad backup becomes ' +
          'two lost boards.',
      )
    }
    return
  }

  const members = (
    await run(
      'psql',
      [
        '-tAc',
        "select case when to_regclass('public.users') is null then 0 " +
          'else (select count(*) from users) end',
      ],
      databaseEnvironment,
    )
  ).trim()
  if (members !== '0') {
    throw new ValidationError(
      `The target database holds ${members} member account(s). The installer only restores ` +
        'over an empty, uninstalled board.',
    )
  }

  if (tables !== '0') {
    log.info(`Dropping the empty schema (${tables} table(s)) before the restore…`)
  }
  await run('psql', ['-v', 'ON_ERROR_STOP=1', '-q'], databaseEnvironment, RESET_SCHEMA_SQL)
}

export async function restoreBackup(input: RestoreInput): Promise<RestoreOutcome> {
  const log = input.log ?? SILENT_LOG
  const databaseEnvironment = postgresClientEnvironment(input.target.url, input.target.variable)

  const bundleInfo = await stat(input.bundle).catch(() => undefined)
  if (bundleInfo === undefined || !bundleInfo.isFile()) {
    throw new ValidationError(`No such bundle: ${input.bundle}`)
  }
  if (bundleInfo.size > input.limits.archiveBytes) {
    throw new ValidationError('The backup bundle exceeds MEITH_RESTORE_MAX_ARCHIVE_BYTES.')
  }

  const stage = await mkdtemp(path.join(tmpdir(), 'meith-restore-'))
  try {
    const stagedBundle = path.join(stage, 'bundle.tar.gz')
    await copyFile(path.resolve(input.bundle), stagedBundle)
    const members = await inspectArchive(stagedBundle, input.limits, new Set(['-']))
    const possibleMembers = new Set(['manifest.json', 'db.dump', 'uploads.tar.gz'])
    if (members.some((member) => !possibleMembers.has(member.name))) {
      throw new ValidationError('The backup bundle contains an unexpected member.')
    }
    await run('tar', ['xzf', stagedBundle, '-C', stage, 'manifest.json'])
    const manifest = parseManifest(await readFile(path.join(stage, 'manifest.json'), 'utf8'))
    const expectedMembers = new Set(['manifest.json', 'db.dump'])
    if (manifest.uploads === 'included') expectedMembers.add('uploads.tar.gz')
    if (
      members.length !== expectedMembers.size ||
      members.some((member) => !expectedMembers.has(member.name))
    ) {
      throw new ValidationError('The backup bundle members do not match its manifest.')
    }

    const refusal = versionRefusal(manifest.version, input.codeVersion)
    if (refusal !== null) throw new ValidationError(refusal)

    const restoreMembers = ['db.dump']
    if (manifest.uploads === 'included') restoreMembers.push('uploads.tar.gz')
    await run('tar', ['xzf', stagedBundle, '-C', stage, ...restoreMembers])

    await prepareTarget(input.target, databaseEnvironment, log)

    log.info(`Restoring the backup taken ${manifest.createdAt} (version ${manifest.version})…`)
    await run(
      'pg_restore',
      [
        '--no-owner',
        '--no-privileges',
        '--dbname',
        databaseEnvironment.PGDATABASE ?? '',
        path.join(stage, 'db.dump'),
      ],
      databaseEnvironment,
    )

    const migrationsApplied = await input.migrate(input.target.url)
    log.info(
      migrationsApplied === 0
        ? 'Migrations: nothing to do — the dump matches this build.'
        : `Migrations: applied ${migrationsApplied} migration(s) the dump predates.`,
    )

    const posts = Number(
      (await run('psql', ['-tAc', 'select count(*) from posts'], databaseEnvironment)).trim(),
    )
    log.info(`The restored board holds ${posts} post(s).`)

    let uploads: RestoreOutcome['uploads'] = 'none'
    let pushed = 0
    if (manifest.uploads === 'included') {
      if (input.uploads.mode === 'skip') {
        uploads = 'skipped'
      } else if (input.uploads.mode === 'store') {
        pushed = await pushUploadsToStore(
          stage,
          input.limits,
          input.uploads.store,
          input.uploads.description,
          log,
        )
        uploads = 'pushed'
      } else {
        await extractUploads(stage, input.uploads.dir, input.limits, log)
        uploads = 'restored'
      }
    } else {
      log.info(
        manifest.filestore === 's3'
          ? `This bundle carries no uploads — they live in the S3 bucket${
              manifest.bucket === undefined ? '' : ` (${manifest.bucket})`
            }.`
          : manifest.filestore === 'blob'
            ? 'This bundle carries no uploads, and a Vercel Blob store is not ' +
              'something you can copy out by hand. Take another backup with ' +
              '--uploads include while the old board still exists.'
            : 'This bundle carries no uploads.',
      )
    }

    return { manifest, migrationsApplied, posts, uploads, pushed }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
