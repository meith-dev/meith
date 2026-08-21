import { spawn } from 'node:child_process'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { ConfigurationError, env, ValidationError } from '@meith/core'
import { migrationUrl, runMigrations } from '@meith/db'
import { S3FileStore } from '@meith/drivers'

import { optional, parseFlags } from './args'
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

export interface RestoreLimits {
  readonly archiveBytes: number
  readonly members: number
  readonly memberBytes: number
  readonly expandedBytes: number
}

const RESTORE_LIMIT_DEFAULTS: RestoreLimits = {
  archiveBytes: 2 * 1024 * 1024 * 1024,
  members: 100_000,
  memberBytes: 1024 * 1024 * 1024,
  expandedBytes: 8 * 1024 * 1024 * 1024,
}

function positiveInteger(value: string | undefined, variable: string, fallback: number): number {
  if (value === undefined || value === '') return fallback
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(`${variable} must be a positive integer number of bytes or members.`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ValidationError(`${variable} must be a positive integer number of bytes or members.`)
  }
  return parsed
}

export function restoreLimits(environment: NodeJS.ProcessEnv): RestoreLimits {
  return {
    archiveBytes: positiveInteger(
      environment.MEITH_RESTORE_MAX_ARCHIVE_BYTES,
      'MEITH_RESTORE_MAX_ARCHIVE_BYTES',
      RESTORE_LIMIT_DEFAULTS.archiveBytes,
    ),
    members: positiveInteger(
      environment.MEITH_RESTORE_MAX_MEMBERS,
      'MEITH_RESTORE_MAX_MEMBERS',
      RESTORE_LIMIT_DEFAULTS.members,
    ),
    memberBytes: positiveInteger(
      environment.MEITH_RESTORE_MAX_MEMBER_BYTES,
      'MEITH_RESTORE_MAX_MEMBER_BYTES',
      RESTORE_LIMIT_DEFAULTS.memberBytes,
    ),
    expandedBytes: positiveInteger(
      environment.MEITH_RESTORE_MAX_EXPANDED_BYTES,
      'MEITH_RESTORE_MAX_EXPANDED_BYTES',
      RESTORE_LIMIT_DEFAULTS.expandedBytes,
    ),
  }
}

interface ArchiveMember {
  readonly name: string
  readonly type: string
  readonly size: number
}

function normalizedArchiveName(name: string): string | undefined {
  if (name === '' || name.includes('\\') || name.includes('\0')) return undefined
  const withoutDirectoryMarker = name.endsWith('/') ? name.slice(0, -1) : name
  if (withoutDirectoryMarker === '.') return '.'
  const normalized = withoutDirectoryMarker.replace(/^\.\//, '')
  if (normalized === '' || path.posix.isAbsolute(normalized)) return undefined
  const parts = normalized.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return undefined
  return normalized
}

export function validateArchiveListing(
  namesOutput: string,
  verboseOutput: string,
  limits: RestoreLimits,
  allowedTypes: ReadonlySet<string>,
): readonly ArchiveMember[] {
  const names = namesOutput === '' ? [] : namesOutput.replace(/\n$/, '').split('\n')
  const verbose = verboseOutput === '' ? [] : verboseOutput.replace(/\n$/, '').split('\n')
  if (names.length !== verbose.length) {
    throw new ValidationError('The archive has malformed member names.')
  }
  if (names.length > limits.members) {
    throw new ValidationError(`The archive has more than ${limits.members} members.`)
  }

  const seen = new Set<string>()
  let expandedBytes = 0
  return names.map((rawName, index) => {
    const name = normalizedArchiveName(rawName)
    if (name === undefined || seen.has(name)) {
      throw new ValidationError(`The archive contains an unsafe or duplicate member: ${rawName}`)
    }
    seen.add(name)

    const fields = verbose[index]?.trim().split(/\s+/) ?? []
    const type = fields[0]?.[0] ?? ''
    const size = Number(fields[2])
    if (!allowedTypes.has(type) || !Number.isSafeInteger(size) || size < 0) {
      throw new ValidationError(`The archive contains an unsupported member: ${name}`)
    }
    if (size > limits.memberBytes) {
      throw new ValidationError(`The archive member ${name} exceeds the per-member size limit.`)
    }
    expandedBytes += size
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.expandedBytes) {
      throw new ValidationError('The archive exceeds the expanded-size limit.')
    }
    return { name, type, size }
  })
}

async function inspectArchive(
  archive: string,
  limits: RestoreLimits,
  allowedTypes: ReadonlySet<string>,
): Promise<readonly ArchiveMember[]> {
  const [names, verbose] = await Promise.all([
    run('tar', ['tzf', archive]),
    run('tar', ['tvzf', archive]),
  ])
  return validateArchiveListing(names, verbose, limits, allowedTypes)
}

function missingToolError(command: string): ConfigurationError {
  return new ConfigurationError(
    `${command} was not found on PATH. The shipped image carries the postgres client ` +
      'tools; elsewhere install them (postgresql18-client on Alpine, ' +
      'postgresql-client on Debian and Ubuntu).',
  )
}

const POSTGRES_PARAMETERS: Readonly<Record<string, string>> = {
  application_name: 'PGAPPNAME',
  channel_binding: 'PGCHANNELBINDING',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  gssencmode: 'PGGSSENCMODE',
  options: 'PGOPTIONS',
  requirepeer: 'PGREQUIREPEER',
  sslcert: 'PGSSLCERT',
  sslcompression: 'PGSSLCOMPRESSION',
  sslcrl: 'PGSSLCRL',
  sslcrldir: 'PGSSLCRLDIR',
  sslkey: 'PGSSLKEY',
  sslmode: 'PGSSLMODE',
  sslpassword: 'PGSSLPASSWORD',
  sslrootcert: 'PGSSLROOTCERT',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
}

export function postgresClientEnvironment(
  connectionString: string,
  variable: string,
): NodeJS.ProcessEnv {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new ValidationError(`${variable} must be a valid postgres:// connection string.`)
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new ValidationError(`${variable} must be a postgres:// connection string.`)
  }
  let database: string
  let username: string
  let password: string
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''))
    username = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  } catch {
    throw new ValidationError(`${variable} contains invalid percent-encoding.`)
  }
  if (url.hostname === '' || username === '' || database === '') {
    throw new ValidationError(`${variable} must include a host, user, and database name.`)
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env }
  for (const environmentVariable of [
    'PGAPPNAME',
    'PGCHANNELBINDING',
    'PGCONNECT_TIMEOUT',
    'PGDATABASE',
    'PGGSSENCMODE',
    'PGHOST',
    'PGHOSTADDR',
    'PGOPTIONS',
    'PGPASSWORD',
    'PGPORT',
    'PGREQUIREPEER',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGSSLCERT',
    'PGSSLCOMPRESSION',
    'PGSSLCRL',
    'PGSSLCRLDIR',
    'PGSSLKEY',
    'PGSSLMODE',
    'PGSSLPASSWORD',
    'PGSSLROOTCERT',
    'PGTARGETSESSIONATTRS',
    'PGUSER',
  ]) {
    delete childEnv[environmentVariable]
  }
  Object.assign(childEnv, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: username,
    PGDATABASE: database,
  })
  if (password !== '') childEnv.PGPASSWORD = password

  for (const [parameter, environmentVariable] of Object.entries(POSTGRES_PARAMETERS)) {
    const value = url.searchParams.get(parameter)
    if (value !== null) childEnv[environmentVariable] = value
  }
  return childEnv
}

async function run(
  command: string,
  args: readonly string[],
  childEnv: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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

export async function reserveBackupDestination(destination: string): Promise<void> {
  const file = await open(destination, 'wx', 0o600)
  await file.close()
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
  let destinationCreated = false
  try {
    console.log(
      env.DIRECT_DATABASE_URL === undefined
        ? 'Dumping the database…'
        : 'Dumping the database over DIRECT_DATABASE_URL…',
    )
    const databaseVariable =
      env.DIRECT_DATABASE_URL === undefined ? 'DATABASE_URL' : 'DIRECT_DATABASE_URL'
    const databaseEnvironment = postgresClientEnvironment(migrationUrl(env), databaseVariable)
    await run(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-privileges', '--file', path.join(stage, 'db.dump')],
      databaseEnvironment,
    )

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
    await reserveBackupDestination(out)
    destinationCreated = true
    await run('tar', ['czf', out, '-C', stage, ...members])
    await chmod(out, 0o600)

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
    destinationCreated = false
    return 0
  } finally {
    if (destinationCreated) await rm(out, { force: true })
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

async function extractUploads(stage: string, dir: string, limits: RestoreLimits): Promise<void> {
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
  console.log(`Restored the uploads into ${dir}.`)
}

async function pushUploadsToS3(stage: string, limits: RestoreLimits): Promise<void> {
  await validateUploadsArchive(stage, limits)
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
  'Usage: RESTORE_DATABASE_URL=<postgres://…> community restore <bundle.tar.gz> ' +
  '[--uploads-dir <dir>] [--skip-uploads]'

export function restoreDatabaseUrl(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
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
  const databaseEnvironment = postgresClientEnvironment(target, 'RESTORE_DATABASE_URL')

  const bundleInfo = await stat(bundle).catch(() => undefined)
  if (bundleInfo === undefined || !bundleInfo.isFile()) {
    throw new ValidationError(`No such bundle: ${bundle}`)
  }

  const limits = restoreLimits(process.env)
  if (bundleInfo.size > limits.archiveBytes) {
    throw new ValidationError('The backup bundle exceeds MEITH_RESTORE_MAX_ARCHIVE_BYTES.')
  }

  const stage = await mkdtemp(path.join(tmpdir(), 'meith-restore-'))
  try {
    const stagedBundle = path.join(stage, 'bundle.tar.gz')
    await copyFile(path.resolve(bundle), stagedBundle)
    const members = await inspectArchive(stagedBundle, limits, new Set(['-']))
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
    const restoreMembers = ['db.dump']
    if (manifest.uploads === 'included') restoreMembers.push('uploads.tar.gz')
    await run('tar', ['xzf', stagedBundle, '-C', stage, ...restoreMembers])

    const tables = (
      await run(
        'psql',
        ['-tAc', "select count(*) from information_schema.tables where table_schema = 'public'"],
        databaseEnvironment,
      )
    ).trim()
    if (tables !== '0') {
      throw new ValidationError(
        `The target database already holds ${tables} table(s). Restore into a new, ` +
          'empty database — a restore over a live board is how a bad backup becomes ' +
          'two lost boards.',
      )
    }

    console.log(`Restoring the backup taken ${manifest.createdAt} (version ${manifest.version})…`)
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

    const applied = await runMigrations({ url: target })
    console.log(
      applied === 0
        ? 'Migrations: nothing to do — the dump matches this build.'
        : `Migrations: applied ${applied} migration(s) the dump predates.`,
    )

    const posts = (
      await run('psql', ['-tAc', 'select count(*) from posts'], databaseEnvironment)
    ).trim()
    console.log(`The restored board holds ${posts} post(s).`)

    if (manifest.uploads === 'included' && flags.get('skip-uploads') !== 'true') {
      const uploadsDir = optional(flags, 'uploads-dir')
      if (env.FILESTORE_DRIVER === 's3' && uploadsDir === undefined) {
        await pushUploadsToS3(stage, limits)
      } else {
        await extractUploads(stage, uploadsDir ?? env.UPLOADS_DIR, limits)
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
