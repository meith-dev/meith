import { rm, stat } from 'node:fs/promises'
import path from 'node:path'

import {
  type BackupDestination,
  type BackupLog,
  BackupShippingError,
  backupDestinationFromEnv,
  claimBackupDestination,
  createBackup,
  formatBytes,
  isBundleName,
  localBundles,
  openBackupDestination,
  type RetentionPolicy,
  resolveKeep,
  resolveUploadsMode,
  restoreBackup,
  restoreLimits,
  skippedKeyLines,
} from '@meith/backup'
import { ConfigurationError, env, ValidationError } from '@meith/core'
import { getDb, PostgresBackupRunRepository, runMigrations } from '@meith/db'
import { BlobFileStore, S3FileStore } from '@meith/drivers'
import {
  type BackupSettingsView,
  backupDestinationFor,
  backupRingDirectory,
  backupSourceFrom,
  loadBackupSettings,
} from '@meith/runtime'

import { optional, parseFlags } from './args'
import { requirePostgres } from './context'
import { CODE_VERSION } from './upgrade'
import { translateWriteError } from './write-errors'

const INCOMPLETE_BUNDLE_EXIT_CODE = 2

const CONSOLE_LOG: BackupLog = {
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
}

const NO_DESTINATION_HINT =
  'set BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID and ' +
  'BACKUP_S3_SECRET_ACCESS_KEY, or BACKUP_WEBDAV_URL with its username and password, ' +
  'or name one under Admin → Settings → Backups'

interface BoardBackupPlan {
  readonly destination: BackupDestination | undefined
  readonly retention: RetentionPolicy | undefined
}

async function boardBackupSettings(): Promise<BackupSettingsView | null> {
  if (env.DATA_SOURCE !== 'postgres') return null
  try {
    return await loadBackupSettings(getDb(), env)
  } catch {
    return null
  }
}

async function boardBackupPlan(): Promise<BoardBackupPlan> {
  const fromEnvironment = backupDestinationFromEnv(process.env)
  if (fromEnvironment !== undefined) {
    return { destination: openBackupDestination(fromEnvironment), retention: undefined }
  }
  const settings = await boardBackupSettings()
  if (settings === null) return { destination: undefined, retention: undefined }
  if (settings.destination.problem !== null) {
    console.warn(`The board's off-site destination is unusable: ${settings.destination.problem}`)
  }
  return { destination: backupDestinationFor(settings.destination), retention: settings.retention }
}

export async function backupCommand(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)
  requirePostgres()

  const mode = resolveUploadsMode(env.FILESTORE_DRIVER, optional(flags, 'uploads'))
  const outFlag = optional(flags, 'out')
  const dirFlag = optional(flags, 'dir')
  if (outFlag !== undefined && dirFlag !== undefined) {
    throw new ValidationError('--out and --dir are two answers to one question; pass one.')
  }
  const plan = await boardBackupPlan()
  const offsite = plan.destination
  const keepFlag = optional(flags, 'keep')
  if (keepFlag !== undefined && dirFlag === undefined && offsite === undefined) {
    throw new ValidationError(
      '--keep prunes a ring of bundles, so it needs --dir, an off-site destination ' +
        '(BACKUP_S3_*), or both.',
    )
  }
  const retention: RetentionPolicy =
    keepFlag === undefined && plan.retention !== undefined
      ? plan.retention
      : { keep: resolveKeep(keepFlag) }
  const startedAt = new Date()

  const record = async (
    outcome: Parameters<PostgresBackupRunRepository['record']>[0]['outcome'],
  ) => {
    try {
      await new PostgresBackupRunRepository(getDb()).record({ trigger: 'cli', startedAt, outcome })
    } catch {
      console.log('The board did not record this run.')
    }
  }

  let outcome: Awaited<ReturnType<typeof createBackup>>
  try {
    outcome = await createBackup({
      source: backupSourceFrom(env, CODE_VERSION),
      target: {
        ...(outFlag === undefined ? {} : { out: outFlag }),
        ...(dirFlag === undefined ? {} : { dir: dirFlag }),
        destination: offsite,
        retention,
      },
      uploads: mode,
      now: startedAt,
      log: CONSOLE_LOG,
      translateWriteError: (error, destination) =>
        translateWriteError(error, {
          command: 'backup',
          path: destination,
          target: path.dirname(destination),
          reference: 'docs/guides/operations/backups.md, "From the command line"',
        }),
    })
  } catch (error) {
    if (error instanceof BackupShippingError) {
      await record({
        status: 'failed',
        finishedAt: new Date(),
        error: error.message,
        bundleName: error.bundle.name,
        sizeBytes: error.bundle.size,
        uploads: error.bundle.uploads,
        skippedKeys: error.bundle.skippedKeys.length,
      })
    }
    throw error
  }

  await record({
    status: outcome.skippedKeys.length === 0 ? 'done' : 'incomplete',
    finishedAt: new Date(),
    bundleName: outcome.name,
    sizeBytes: outcome.size,
    uploads: outcome.uploads,
    shipped: outcome.shipped !== null,
    skippedKeys: outcome.skippedKeys.length,
  })

  if (outcome.skippedKeys.length === 0) return 0

  console.warn(
    `\nThis bundle is missing ${outcome.skippedKeys.length} object(s) whose keys nothing can read:`,
  )
  for (const line of skippedKeyLines(outcome.skippedKeys)) console.warn(line)
  console.warn(
    'The bundle itself is sound and restores normally — posts referring to those ' +
      'objects will have broken images. The manifest carries the list, so the ' +
      `restore says so too. Exiting ${INCOMPLETE_BUNDLE_EXIT_CODE} rather than 0 so a ` +
      'scheduled backup does not record this run as a clean one.',
  )
  return INCOMPLETE_BUNDLE_EXIT_CODE
}

const RESTORE_USAGE =
  'Usage: RESTORE_DATABASE_URL=<postgres://…> meith restore <bundle.tar.gz> ' +
  '[--uploads-dir <dir>] [--skip-uploads]'

export function restoreDatabaseUrl(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const { flags } = parseFlags(args)
  if (flags.has('database-url')) {
    throw new ValidationError(
      '--database-url is not supported because process arguments are observable. ' +
        'Set RESTORE_DATABASE_URL in the environment instead.',
    )
  }
  const target = environment.RESTORE_DATABASE_URL
  if (target === undefined || target === '') {
    throw new ValidationError(`RESTORE_DATABASE_URL is required.\n${RESTORE_USAGE}`)
  }
  return target
}

export async function restoreCommand(args: readonly string[]): Promise<number> {
  const { flags, positional } = parseFlags(args)

  const bundle = positional[0]
  if (bundle === undefined) throw new ValidationError(RESTORE_USAGE)

  const target = restoreDatabaseUrl(args, process.env)
  const uploadsDir = optional(flags, 'uploads-dir')
  const skipUploads = flags.get('skip-uploads') === 'true'

  const uploads = skipUploads
    ? ({ mode: 'skip' } as const)
    : env.FILESTORE_DRIVER === 's3' && uploadsDir === undefined
      ? ({
          mode: 'store',
          store: S3FileStore.fromEnv(env),
          description: `${env.S3_BUCKET}`,
        } as const)
      : env.FILESTORE_DRIVER === 'blob' && uploadsDir === undefined
        ? ({
            mode: 'store',
            store: BlobFileStore.fromEnv(env),
            description: 'the Blob store',
          } as const)
        : ({ mode: 'directory', dir: uploadsDir ?? env.UPLOADS_DIR } as const)

  const outcome = await restoreBackup({
    bundle,
    target: { url: target, variable: 'RESTORE_DATABASE_URL', mode: 'empty-database' },
    codeVersion: CODE_VERSION,
    migrate: (url) => runMigrations({ url }),
    uploads,
    limits: restoreLimits(process.env),
    log: CONSOLE_LOG,
  })

  if (outcome.manifest.skippedKeys !== undefined) {
    console.warn(
      `\nThe backup that made this bundle could not read ${outcome.manifest.skippedKeys.length} ` +
        'object(s), so they are not here:',
    )
    for (const line of skippedKeyLines(outcome.manifest.skippedKeys)) console.warn(line)
    console.warn(
      'Posts referring to them have broken images. Those keys were unusable in the ' +
        'source store, so another backup of the same board would skip them again.',
    )
  }

  console.log(
    'Point a staging deployment at the restored database, sign in as an ' +
      'administrator, and open a thread with attachments before trusting it.',
  )
  return 0
}

export async function backupListCommand(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)
  const dir = path.resolve(optional(flags, 'dir') ?? backupRingDirectory(env))
  const offsite = (await boardBackupPlan()).destination

  const bundles = await localBundles(dir)
  console.log(`${dir}:`)
  if (bundles.length === 0) console.log('  no bundles')
  for (const bundle of bundles) {
    console.log(`  ${bundle.name}  ${formatBytes(bundle.size)}`)
  }

  if (offsite !== undefined) {
    const remote = await offsite.list()
    console.log(`${offsite.description}:`)
    if (remote.length === 0) console.log('  no bundles')
    for (const bundle of remote) {
      console.log(`  ${bundle.name}  ${formatBytes(bundle.size)}`)
    }
  } else {
    console.log(`No off-site destination: ${NO_DESTINATION_HINT}, to list one.`)
  }

  return 0
}

const FETCH_USAGE = 'Usage: meith backup:fetch <meith-backup-….tar.gz> [--out <path>]'

export async function backupFetchCommand(args: readonly string[]): Promise<number> {
  const { flags, positional } = parseFlags(args)

  const name = positional[0]
  if (name === undefined) throw new ValidationError(FETCH_USAGE)
  if (!isBundleName(path.basename(name))) {
    throw new ValidationError(
      `Not a backup bundle name: ${JSON.stringify(name)}. meith backup:list names what ` +
        'the destination holds.',
    )
  }

  const offsite = (await boardBackupPlan()).destination
  if (offsite === undefined) {
    throw new ConfigurationError(
      `backup:fetch downloads from the off-site destination, so it needs one: ${NO_DESTINATION_HINT}.`,
    )
  }

  const out = path.resolve(optional(flags, 'out') ?? path.basename(name))
  await claimBackupDestination(out, (error, destination) =>
    translateWriteError(error, {
      command: 'backup:fetch',
      path: destination,
      target: path.dirname(destination),
      reference: 'docs/guides/operations/backups.md, "From the command line"',
    }),
  )
  try {
    await offsite.getToFile(path.basename(name), out)
  } catch (error) {
    await rm(out, { force: true })
    throw error
  }

  console.log(
    `Fetched ${out} (${formatBytes((await stat(out)).size)}) from ${offsite.description}.`,
  )
  console.log(`Restore it with: ${RESTORE_USAGE.replace('Usage: ', '')}`)
  return 0
}
