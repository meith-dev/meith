import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { ConfigurationError, env, ValidationError } from '@meith/core'
import { migrationUrl, runMigrations } from '@meith/db'
import { S3FileStore } from '@meith/drivers'

import { optional, parseFlags, required } from './args'
import { requirePostgres } from './context'
import { CODE_VERSION } from './upgrade'

export type UploadsMode = 'include' | 'skip'

export interface BackupManifest {
  readonly format: 1
  readonly createdAt: string
  readonly version: string
  readonly filestore: 'local' | 's3'
  readonly uploads: 'included' | 'skipped'
  readonly bucket?: string
}

export function resolveUploadsMode(driver: 'local' | 's3', flag: string | undefined): UploadsMode {
  if (flag === undefined) return driver === 'local' ? 'include' : 'skip'
  if (flag === 'include' || flag === 'skip') return flag
  throw new ValidationError(`--uploads must be "include" or "skip", got "${flag}".`)
}

export function bundleName(at: Date): string {
  const stamp = at
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(':', '-')
  return `meith-backup-${stamp}.tar.gz`
}

export function parseManifest(raw: string): BackupManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ValidationError('The bundle manifest is not valid JSON.')
  }

  const manifest = parsed as Partial<BackupManifest>
  if (manifest.format !== 1) {
    throw new ValidationError(
      `This bundle declares format ${JSON.stringify(manifest.format)}; this build restores format 1.`,
    )
  }
  if (manifest.uploads !== 'included' && manifest.uploads !== 'skipped') {
    throw new ValidationError('The bundle manifest does not say whether uploads are included.')
  }
  if (typeof manifest.createdAt !== 'string' || typeof manifest.version !== 'string') {
    throw new ValidationError('The bundle manifest is missing createdAt or version.')
  }
  if (manifest.filestore !== 'local' && manifest.filestore !== 's3') {
    throw new ValidationError('The bundle manifest does not name a known file driver.')
  }

  return {
    format: 1,
    createdAt: manifest.createdAt,
    version: manifest.version,
    filestore: manifest.filestore,
    uploads: manifest.uploads,
    ...(typeof manifest.bucket === 'string' ? { bucket: manifest.bucket } : {}),
  }
}

const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

export function contentTypeFor(key: string): string {
  return CONTENT_TYPES.get(path.extname(key).toLowerCase()) ?? 'application/octet-stream'
}

export function formatBytes(size: number): string {
  let value = size
  let unit = 'B'
  for (const next of ['KiB', 'MiB', 'GiB', 'TiB']) {
    if (value < 1024) break
    value /= 1024
    unit = next
  }
  return unit === 'B' ? `${value} B` : `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
}

function missingToolError(command: string): ConfigurationError {
  return new ConfigurationError(
    `${command} was not found on PATH. The shipped image carries the postgres client ` +
      'tools; elsewhere install them (postgresql18-client on Alpine, ' +
      'postgresql-client on Debian and Ubuntu).',
  )
}

async function run(command: string, args: readonly string[]): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      reject((error as NodeJS.ErrnoException).code === 'ENOENT' ? missingToolError(command) : error)
    })
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout)
      else {
        reject(
          new ConfigurationError(
            `${command} exited with ${code === null ? 'a signal' : `code ${code}`}.` +
              (stderr.trim() === '' ? '' : `\n${stderr.trim()}`),
          ),
        )
      }
    })
  })
}

async function stageLocalUploads(stage: string): Promise<'included' | 'skipped'> {
  const exists = await stat(env.UPLOADS_DIR).then(
    (info) => info.isDirectory(),
    () => false,
  )
  if (!exists) {
    console.log(`No uploads directory at ${env.UPLOADS_DIR}; the bundle carries none.`)
    return 'skipped'
  }

  await run('tar', ['czf', path.join(stage, 'uploads.tar.gz'), '-C', env.UPLOADS_DIR, '.'])
  return 'included'
}

async function stageS3Uploads(stage: string): Promise<'included' | 'skipped'> {
  const store = S3FileStore.fromEnv(env)
  const dir = path.join(stage, 'uploads')
  await mkdir(dir, { recursive: true })

  let pulled = 0
  for await (const key of store.listKeys()) {
    const target = path.resolve(dir, key)
    if (target !== dir && !target.startsWith(dir + path.sep)) {
      console.warn(`Skipping object with an unsafe key: ${key}`)
      continue
    }
    const body = await store.get(key)
    if (body === undefined) continue
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
    pulled++
  }

  if (pulled === 0) {
    console.log(`The ${env.S3_BUCKET} bucket is empty; the bundle carries no uploads.`)
    await rm(dir, { recursive: true, force: true })
    return 'skipped'
  }

  await run('tar', ['czf', path.join(stage, 'uploads.tar.gz'), '-C', dir, '.'])
  await rm(dir, { recursive: true, force: true })
  console.log(`Pulled ${pulled} object(s) from ${env.S3_BUCKET}.`)
  return 'included'
}

export async function backupCommand(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)
  requirePostgres()

  const mode = resolveUploadsMode(env.FILESTORE_DRIVER, optional(flags, 'uploads'))
  const now = new Date()
  const out = path.resolve(optional(flags, 'out') ?? bundleName(now))

  const stage = await mkdtemp(path.join(tmpdir(), 'meith-backup-'))
  try {
    console.log(
      env.DIRECT_DATABASE_URL === undefined
        ? 'Dumping the database…'
        : 'Dumping the database over DIRECT_DATABASE_URL…',
    )
    await run('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      path.join(stage, 'db.dump'),
      migrationUrl(env),
    ])

    const uploads =
      mode === 'skip'
        ? 'skipped'
        : env.FILESTORE_DRIVER === 's3'
          ? await stageS3Uploads(stage)
          : await stageLocalUploads(stage)

    const manifest: BackupManifest = {
      format: 1,
      createdAt: now.toISOString(),
      version: CODE_VERSION,
      filestore: env.FILESTORE_DRIVER,
      uploads,
      ...(env.S3_BUCKET === undefined ? {} : { bucket: env.S3_BUCKET }),
    }
    await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    const members = ['manifest.json', 'db.dump']
    if (uploads === 'included') members.push('uploads.tar.gz')
    await run('tar', ['czf', out, '-C', stage, ...members])

    const size = (await stat(out)).size
    console.log(
      `Wrote ${out} (${formatBytes(size)}): the database dump${
        uploads === 'included' ? ' and the uploads' : ', no uploads'
      }.`,
    )
    if (uploads === 'skipped' && env.FILESTORE_DRIVER === 's3' && mode !== 'include') {
      console.log(
        'The S3 bucket was not pulled — it has its own backup story. ' +
          'Run with --uploads include for a bundle that carries every object.',
      )
    }
    if (uploads === 'skipped' && mode === 'skip') {
      console.log('Restoring this bundle gives a board whose posts have broken images.')
    }
    console.log(
      'Copy the bundle off this machine: a backup on the server is a backup of the ' +
        'thing most likely to fail.',
    )
    return 0
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

async function walk(dir: string): Promise<readonly string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

async function extractUploads(stage: string, dir: string): Promise<void> {
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
  console.log(`Restored the uploads into ${dir}.`)
}

async function pushUploadsToS3(stage: string): Promise<void> {
  const dir = path.join(stage, 'uploads-extract')
  await mkdir(dir, { recursive: true })
  await run('tar', ['xzf', path.join(stage, 'uploads.tar.gz'), '-C', dir])

  const store = S3FileStore.fromEnv(env)
  let pushed = 0
  for (const file of await walk(dir)) {
    const key = path.relative(dir, file).split(path.sep).join('/')
    await store.put(key, await readFile(file), {
      contentType: contentTypeFor(key),
      visibility: 'public',
    })
    pushed++
  }
  console.log(`Uploaded ${pushed} object(s) to ${env.S3_BUCKET}.`)
}

const RESTORE_USAGE =
  'Usage: community restore <bundle.tar.gz> --database-url <postgres://…> ' +
  '[--uploads-dir <dir>] [--skip-uploads]'

export async function restoreCommand(args: readonly string[]): Promise<number> {
  const { flags, positional } = parseFlags(args)

  const bundle = positional[0]
  if (bundle === undefined) throw new ValidationError(RESTORE_USAGE)

  const target = required(flags, 'database-url')
  if (!target.startsWith('postgres://') && !target.startsWith('postgresql://')) {
    throw new ValidationError('--database-url must be a postgres:// connection string.')
  }

  const readable = await stat(bundle).then(
    (info) => info.isFile(),
    () => false,
  )
  if (!readable) throw new ValidationError(`No such bundle: ${bundle}`)

  const stage = await mkdtemp(path.join(tmpdir(), 'meith-restore-'))
  try {
    await run('tar', ['xzf', path.resolve(bundle), '-C', stage])
    const manifest = parseManifest(await readFile(path.join(stage, 'manifest.json'), 'utf8'))

    const tables = (
      await run('psql', [
        target,
        '-tAc',
        "select count(*) from information_schema.tables where table_schema = 'public'",
      ])
    ).trim()
    if (tables !== '0') {
      throw new ValidationError(
        `The target database already holds ${tables} table(s). Restore into a new, ` +
          'empty database — a restore over a live board is how a bad backup becomes ' +
          'two lost boards.',
      )
    }

    console.log(`Restoring the backup taken ${manifest.createdAt} (version ${manifest.version})…`)
    await run('pg_restore', [
      '--no-owner',
      '--no-privileges',
      `--dbname=${target}`,
      path.join(stage, 'db.dump'),
    ])

    const applied = await runMigrations({ url: target })
    console.log(
      applied === 0
        ? 'Migrations: nothing to do — the dump matches this build.'
        : `Migrations: applied ${applied} migration(s) the dump predates.`,
    )

    const posts = (await run('psql', [target, '-tAc', 'select count(*) from posts'])).trim()
    console.log(`The restored board holds ${posts} post(s).`)

    if (manifest.uploads === 'included' && flags.get('skip-uploads') !== 'true') {
      const uploadsDir = optional(flags, 'uploads-dir')
      if (env.FILESTORE_DRIVER === 's3' && uploadsDir === undefined) {
        await pushUploadsToS3(stage)
      } else {
        await extractUploads(stage, uploadsDir ?? env.UPLOADS_DIR)
      }
    } else if (manifest.uploads === 'skipped') {
      console.log(
        manifest.filestore === 's3'
          ? `This bundle carries no uploads — they live in the S3 bucket${
              manifest.bucket === undefined ? '' : ` (${manifest.bucket})`
            }.`
          : 'This bundle carries no uploads.',
      )
    }

    console.log(
      'Point a staging deployment at the restored database, sign in as an ' +
        'administrator, and open a thread with attachments before trusting it.',
    )
    return 0
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
