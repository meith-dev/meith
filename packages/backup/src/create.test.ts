import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  commands: [] as string[][],
  restoreSql: [] as string[],
  users: '0',
  tables: '4',
}))

vi.mock('./postgres-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./postgres-client')>()
  return {
    ...actual,
    async run(command: string, args: readonly string[], env?: NodeJS.ProcessEnv, input?: string) {
      if (command === 'tar') return actual.run(command, args, env, input)
      fake.commands.push([command, ...args])
      if (command === 'pg_dump') {
        const at = args.indexOf('--file')
        await writeFile(args[at + 1] as string, 'dump bytes')
        return ''
      }
      if (command === 'psql') {
        if (input !== undefined) {
          fake.restoreSql.push(input)
          return ''
        }
        const statement = args[args.length - 1] ?? ''
        if (statement.includes('from posts')) return '42\n'
        if (statement.includes('users')) return `${fake.users}\n`
        return `${fake.tables}\n`
      }
      return ''
    },
  }
})

import {
  claimBackupDestination,
  createBackup,
  localBundles,
  reserveBackupDestination,
} from './create'
import type { BackupDestination } from './destination'
import { restoreBackup, versionRefusal } from './restore'

function fakeDestination(): BackupDestination & { objects: Map<string, number> } {
  const objects = new Map<string, number>()
  return {
    objects,
    description: 'the fake bucket',
    list: async () => [...objects].map(([name, size]) => ({ name, size })),
    async putFile(name, _file, size) {
      objects.set(name, size)
    },
    getToFile: () => Promise.reject(new Error('not needed')),
    open: () => Promise.resolve(null),
    async delete(name) {
      objects.delete(name)
    },
    async prune(policy) {
      const names = [...objects.keys()].sort().reverse().slice(policy.keep)
      for (const name of names) objects.delete(name)
      return names
    },
    downloadUrl: () => Promise.resolve('https://example.test/signed'),
  }
}

describe('createBackup', () => {
  let scratch: string

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'meith-create-'))
    fake.commands.length = 0
  })

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  it('writes a bundle into the ring, ships it, and prunes both ends', async () => {
    const uploads = path.join(scratch, 'uploads')
    await mkdir(path.join(uploads, 'avatars'), { recursive: true })
    await writeFile(path.join(uploads, 'avatars', 'a.png'), 'png')
    const ring = path.join(scratch, 'ring')
    await mkdir(ring)
    await writeFile(path.join(ring, 'meith-backup-2026-08-30T02-00-00Z.tar.gz'), 'old')
    await writeFile(path.join(ring, 'meith-backup-2026-08-31T02-00-00Z.tar.gz'), 'older')
    await writeFile(path.join(ring, 'notes.txt'), 'kept')
    const destination = fakeDestination()
    destination.objects.set('meith-backup-2026-08-30T02-00-00Z.tar.gz', 3)
    const lines: string[] = []

    const outcome = await createBackup({
      source: {
        databaseUrl: 'postgres://u:p@db/board',
        databaseVariable: 'DATABASE_URL',
        version: '0.33.4',
        filestore: 'local',
        uploadsDir: uploads,
      },
      target: { dir: ring, destination, retention: { keep: 2 } },
      uploads: 'include',
      now: new Date('2026-09-01T02:00:00Z'),
      log: { info: (line) => lines.push(line), warn: (line) => lines.push(line) },
    })

    expect(outcome.name).toBe('meith-backup-2026-09-01T02-00-00Z.tar.gz')
    expect(outcome.uploads).toBe('included')
    expect(outcome.shipped).toBe('the fake bucket')
    expect(outcome.prunedLocal).toEqual(['meith-backup-2026-08-30T02-00-00Z.tar.gz'])
    expect(outcome.prunedRemote).toEqual([])
    expect((await stat(outcome.path)).mode & 0o777).toBe(0o600)
    expect((await readdir(ring)).sort()).toEqual([
      'meith-backup-2026-08-31T02-00-00Z.tar.gz',
      'meith-backup-2026-09-01T02-00-00Z.tar.gz',
      'notes.txt',
    ])
    expect([...destination.objects.keys()]).toContain(outcome.name)
    expect(fake.commands[0]?.[0]).toBe('pg_dump')
    expect(lines.some((line) => line.includes('Shipped'))).toBe(true)

    expect((await localBundles(ring)).map((bundle) => bundle.name)).toEqual([
      'meith-backup-2026-08-31T02-00-00Z.tar.gz',
      'meith-backup-2026-09-01T02-00-00Z.tar.gz',
    ])
  })

  it('carries an object store, names what it skipped, and writes a single --out file', async () => {
    const out = path.join(scratch, 'board.tar.gz')
    const objects = new Map([
      ['attachments/a/source', 'bytes'],
      ['attachments/./bad', 'unreadable'],
    ])
    const outcome = await createBackup({
      source: {
        databaseUrl: 'postgres://u:p@db/board',
        databaseVariable: 'DATABASE_URL',
        version: '0.33.4',
        filestore: 's3',
        uploadsDir: '/nowhere',
        objectStore: {
          bucket: 'uploads-bucket',
          origin: 'the uploads bucket',
          store: {
            async *listKeys() {
              yield* objects.keys()
            },
            get: (key) => Promise.resolve(new TextEncoder().encode(objects.get(key) ?? '')),
          },
        },
      },
      target: { out, retention: { keep: 7 } },
      uploads: 'include',
    })

    expect(outcome.path).toBe(out)
    expect(outcome.skippedKeys).toEqual(['attachments/./bad'])
    expect(outcome.shipped).toBeNull()
    expect(outcome.prunedLocal).toEqual([])
    expect((await stat(out)).size).toBeGreaterThan(0)
  })

  it('refuses an occupied destination and leaves it alone', async () => {
    const out = path.join(scratch, 'board.tar.gz')
    await writeFile(out, 'an earlier bundle')

    await expect(
      createBackup({
        source: {
          databaseUrl: 'postgres://u:p@db/board',
          databaseVariable: 'DATABASE_URL',
          version: '0.33.4',
          filestore: 'local',
          uploadsDir: '/nowhere',
        },
        target: { out, retention: { keep: 7 } },
        uploads: 'skip',
      }),
    ).rejects.toThrow('something is already there')
    expect(await readFile(out, 'utf8')).toBe('an earlier bundle')
  })

  it('rejects --out together with --dir', async () => {
    await expect(
      createBackup({
        source: {
          databaseUrl: 'postgres://u:p@db/board',
          databaseVariable: 'DATABASE_URL',
          version: '0.33.4',
          filestore: 'local',
          uploadsDir: '/nowhere',
        },
        target: { out: 'a', dir: 'b', retention: { keep: 7 } },
        uploads: 'skip',
      }),
    ).rejects.toThrow('--out and --dir')
  })
})

describe('reserveBackupDestination and claimBackupDestination', () => {
  it('creates a private file regardless of the process umask, once', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'meith-backup-test-'))
    const destination = path.join(dir, 'board.tar.gz')
    const previous = process.umask(0o022)
    try {
      await reserveBackupDestination(destination)
      expect((await stat(destination)).mode & 0o777).toBe(0o600)
      await expect(reserveBackupDestination(destination)).rejects.toMatchObject({ code: 'EEXIST' })
      await expect(claimBackupDestination(destination)).rejects.toThrow('--out')
    } finally {
      process.umask(previous)
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('hands a write failure that is not EEXIST to the translator', async () => {
    const translated = vi.fn((): never => {
      throw new Error('translated')
    })
    await expect(
      claimBackupDestination('/proc/no-such-dir/board.tar.gz', translated),
    ).rejects.toThrow('translated')
    expect(translated).toHaveBeenCalled()
  })
})

describe('restoreBackup', () => {
  let scratch: string

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'meith-restore-'))
    fake.commands.length = 0
    fake.restoreSql.length = 0
    fake.users = '0'
    fake.tables = '4'
  })

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  async function bundle(version = '0.33.4'): Promise<string> {
    const uploads = path.join(scratch, 'uploads')
    await mkdir(path.join(uploads, 'avatars'), { recursive: true })
    await writeFile(path.join(uploads, 'avatars', 'a.png'), 'png')
    const outcome = await createBackup({
      source: {
        databaseUrl: 'postgres://u:p@db/board',
        databaseVariable: 'DATABASE_URL',
        version,
        filestore: 'local',
        uploadsDir: uploads,
      },
      target: { out: path.join(scratch, `bundle-${version}.tar.gz`), retention: { keep: 7 } },
      uploads: 'include',
    })
    return outcome.path
  }

  const limits = {
    archiveBytes: 10_000_000,
    members: 100,
    memberBytes: 1_000_000,
    expandedBytes: 10_000_000,
  }

  it('resets an uninstalled schema, restores, migrates, and puts the uploads back', async () => {
    const source = await bundle()
    const restoredUploads = path.join(scratch, 'restored-uploads')
    const migrate = vi.fn(async () => 2)

    const outcome = await restoreBackup({
      bundle: source,
      target: { url: 'postgres://u:p@db/fresh', variable: 'DATABASE_URL', mode: 'reset-schema' },
      codeVersion: '0.34.0',
      migrate,
      uploads: { mode: 'directory', dir: restoredUploads },
      limits,
    })

    expect(outcome.migrationsApplied).toBe(2)
    expect(outcome.posts).toBe(42)
    expect(outcome.uploads).toBe('restored')
    expect(migrate).toHaveBeenCalledWith('postgres://u:p@db/fresh')
    expect(fake.restoreSql[0]).toContain('drop schema if exists public cascade')
    expect(fake.commands.some((command) => command[0] === 'pg_restore')).toBe(true)
    expect(await readFile(path.join(restoredUploads, 'avatars', 'a.png'), 'utf8')).toBe('png')
  })

  it('refuses to reset a database that already holds members', async () => {
    const source = await bundle()
    fake.users = '3'

    await expect(
      restoreBackup({
        bundle: source,
        target: { url: 'postgres://u:p@db/live', variable: 'DATABASE_URL', mode: 'reset-schema' },
        codeVersion: '0.33.4',
        migrate: async () => 0,
        uploads: { mode: 'skip' },
        limits,
      }),
    ).rejects.toThrow('3 member account(s)')
    expect(fake.restoreSql).toEqual([])
  })

  it('refuses a non-empty database in the CLI shape, and a newer bundle anywhere', async () => {
    const source = await bundle('0.35.0')

    await expect(
      restoreBackup({
        bundle: source,
        target: {
          url: 'postgres://u:p@db/live',
          variable: 'RESTORE_DATABASE_URL',
          mode: 'empty-database',
        },
        codeVersion: '0.33.4',
        migrate: async () => 0,
        uploads: { mode: 'skip' },
        limits,
      }),
    ).rejects.toThrow('newer dump')

    const current = await bundle('0.33.4')
    await expect(
      restoreBackup({
        bundle: current,
        target: {
          url: 'postgres://u:p@db/live',
          variable: 'RESTORE_DATABASE_URL',
          mode: 'empty-database',
        },
        codeVersion: '0.33.4',
        migrate: async () => 0,
        uploads: { mode: 'skip' },
        limits,
      }),
    ).rejects.toThrow('already holds 4 table(s)')
  })

  it('pushes the uploads into a store when asked, and skips them when told', async () => {
    const source = await bundle()
    fake.tables = '0'
    const put = vi.fn(async (key: string, body: Uint8Array, options: { contentType: string }) => ({
      key,
      size: body.byteLength,
      contentType: options.contentType,
    }))

    const pushed = await restoreBackup({
      bundle: source,
      target: {
        url: 'postgres://u:p@db/fresh',
        variable: 'RESTORE_DATABASE_URL',
        mode: 'empty-database',
      },
      codeVersion: '0.33.4',
      migrate: async () => 0,
      uploads: { mode: 'store', store: { put }, description: 'the bucket' },
      limits,
    })
    expect(pushed.uploads).toBe('pushed')
    expect(pushed.pushed).toBe(1)
    expect(put).toHaveBeenCalledWith('avatars/a.png', expect.anything(), expect.anything())

    const skipped = await restoreBackup({
      bundle: source,
      target: {
        url: 'postgres://u:p@db/fresh',
        variable: 'RESTORE_DATABASE_URL',
        mode: 'empty-database',
      },
      codeVersion: '0.33.4',
      migrate: async () => 0,
      uploads: { mode: 'skip' },
      limits,
    })
    expect(skipped.uploads).toBe('skipped')
  })
})

describe('versionRefusal', () => {
  it('refuses only a newer bundle, and tolerates an unparseable version', () => {
    expect(versionRefusal('0.33.4', '0.33.4')).toBeNull()
    expect(versionRefusal('0.30.0', '0.33.4')).toBeNull()
    expect(versionRefusal('0.34.0', '0.33.4')).toContain('forward-only')
    expect(versionRefusal('0.0.0-dev', '0.33.4')).toBeNull()
  })
})
