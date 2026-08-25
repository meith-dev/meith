import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BlobFileStore, type BlobLike } from '@meith/drivers'

import {
  bundleName,
  contentTypeFor,
  drainStoreToDirectory,
  formatBytes,
  parseManifest,
  postgresClientEnvironment,
  reserveBackupDestination,
  resolveUploadsMode,
  restoreDatabaseUrl,
  restoreLimits,
  uploadDirectoryToStore,
  validateArchiveListing,
} from './backup'

describe('postgresClientEnvironment', () => {
  it('converts a connection URL into libpq environment variables', () => {
    const childEnv = postgresClientEnvironment(
      'postgresql://board%40admin:p%40ss%2Fword@db.example.com:6432/community%20board' +
        '?sslmode=require&connect_timeout=8&application_name=meith%20backup',
      'DATABASE_URL',
    )

    expect(childEnv).toMatchObject({
      PGAPPNAME: 'meith backup',
      PGCONNECT_TIMEOUT: '8',
      PGDATABASE: 'community board',
      PGHOST: 'db.example.com',
      PGPASSWORD: 'p@ss/word',
      PGPORT: '6432',
      PGSSLMODE: 'require',
      PGUSER: 'board@admin',
    })
  })

  it('uses defaults without inheriting unrelated libpq credentials', () => {
    const inheritedPassword = process.env.PGPASSWORD
    process.env.PGPASSWORD = 'wrong-database-password'
    try {
      const childEnv = postgresClientEnvironment(
        'postgres://community@[::1]/community',
        'DATABASE_URL',
      )

      expect(childEnv.PGHOST).toBe('::1')
      expect(childEnv.PGPORT).toBe('5432')
      expect(childEnv.PGPASSWORD).toBeUndefined()
    } finally {
      if (inheritedPassword === undefined) delete process.env.PGPASSWORD
      else process.env.PGPASSWORD = inheritedPassword
    }
  })

  it('rejects unsafe or incomplete URLs without echoing their values', () => {
    const secret = 'never-print-this'
    for (const value of [
      `mysql://user:${secret}@localhost/community`,
      `postgres://${secret}@/community`,
      `postgres://user:${secret}@localhost`,
      `postgres://user:${secret}@localhost/bad%ZZ`,
    ]) {
      expect(() => postgresClientEnvironment(value, 'DATABASE_URL')).toThrow(/DATABASE_URL/)
      try {
        postgresClientEnvironment(value, 'DATABASE_URL')
      } catch (error) {
        expect(String(error)).not.toContain(secret)
      }
    }
  })
})

describe('restoreDatabaseUrl', () => {
  it('reads the target from the environment', () => {
    const target = 'postgres://user:secret@localhost/restored'
    expect(restoreDatabaseUrl(['board.tar.gz'], { RESTORE_DATABASE_URL: target })).toBe(target)
  })

  it('rejects a missing environment variable', () => {
    expect(() => restoreDatabaseUrl(['board.tar.gz'], {})).toThrow(/RESTORE_DATABASE_URL/)
  })

  it('rejects the observable command-line flag without echoing its value', () => {
    const secret = 'never-print-this'
    expect(() =>
      restoreDatabaseUrl(
        ['board.tar.gz', '--database-url', `postgres://user:${secret}@db/board`],
        {},
      ),
    ).toThrow(/not supported/)
    try {
      restoreDatabaseUrl(
        ['board.tar.gz', '--database-url', `postgres://user:${secret}@db/board`],
        {},
      )
    } catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })
})

describe('resolveUploadsMode', () => {
  it('includes local uploads unless told otherwise', () => {
    expect(resolveUploadsMode('local', undefined)).toBe('include')
    expect(resolveUploadsMode('local', 'skip')).toBe('skip')
  })

  it('leaves the S3 bucket alone unless told otherwise', () => {
    expect(resolveUploadsMode('s3', undefined)).toBe('skip')
    expect(resolveUploadsMode('s3', 'include')).toBe('include')
  })

  it('carries the Blob store unless told otherwise, because nothing else will', () => {
    expect(resolveUploadsMode('blob', undefined)).toBe('include')
    expect(resolveUploadsMode('blob', 'skip')).toBe('skip')
  })

  it('names the flag on a value it does not know', () => {
    expect(() => resolveUploadsMode('local', 'sometimes')).toThrow(/--uploads/)
  })
})

describe('bundleName', () => {
  it('stamps the moment without characters a filesystem rejects', () => {
    const name = bundleName(new Date('2026-08-20T14:03:07.123Z'))
    expect(name).toBe('meith-backup-2026-08-20T14-03-07Z.tar.gz')
    expect(name).not.toContain(':')
  })
})

describe('parseManifest', () => {
  const manifest = {
    format: 1,
    createdAt: '2026-08-20T14:03:07.123Z',
    version: '0.12.0',
    filestore: 'local',
    uploads: 'included',
  }

  it('round-trips a manifest the backup wrote', () => {
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('keeps the bucket when one is recorded', () => {
    const withBucket = { ...manifest, filestore: 's3', uploads: 'skipped', bucket: 'board' }
    expect(parseManifest(JSON.stringify(withBucket)).bucket).toBe('board')
  })

  it('reads a bundle taken from a Blob store', () => {
    const fromBlob = { ...manifest, filestore: 'blob' }
    expect(parseManifest(JSON.stringify(fromBlob)).filestore).toBe('blob')
  })

  it('refuses a file driver it cannot restore into', () => {
    expect(() => parseManifest(JSON.stringify({ ...manifest, filestore: 'gdrive' }))).toThrow(
      /file driver/,
    )
  })

  it('refuses a format this build does not restore', () => {
    expect(() => parseManifest(JSON.stringify({ ...manifest, format: 2 }))).toThrow(/format 2/)
  })

  it('refuses a bundle that is not a bundle', () => {
    expect(() => parseManifest('not json')).toThrow(/manifest/)
    expect(() => parseManifest(JSON.stringify({ format: 1 }))).toThrow(/uploads/)
  })
})

describe('contentTypeFor', () => {
  it('names image types by extension and falls back to bytes', () => {
    expect(contentTypeFor('avatars/ab/deadbeef.png')).toBe('image/png')
    expect(contentTypeFor('a/b.JPG')).toBe('image/jpeg')
    expect(contentTypeFor('a/b.dump')).toBe('application/octet-stream')
  })
})

describe('formatBytes', () => {
  it('scales to the readable unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KiB')
    expect(formatBytes(52428800)).toBe('50 MiB')
  })
})

describe('reserveBackupDestination', () => {
  it('creates a private file regardless of the process umask', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'meith-backup-test-'))
    const destination = path.join(dir, 'board.tar.gz')
    const previous = process.umask(0o022)
    try {
      await reserveBackupDestination(destination)
      expect((await stat(destination)).mode & 0o777).toBe(0o600)
      await expect(reserveBackupDestination(destination)).rejects.toMatchObject({ code: 'EEXIST' })
    } finally {
      process.umask(previous)
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('restoreLimits', () => {
  it('uses defaults and accepts explicit positive limits', () => {
    expect(restoreLimits({}).members).toBe(100_000)
    expect(restoreLimits({ MEITH_RESTORE_MAX_MEMBERS: '12' }).members).toBe(12)
  })

  it('rejects invalid limits', () => {
    expect(() => restoreLimits({ MEITH_RESTORE_MAX_MEMBERS: '0' })).toThrow(/positive integer/)
    expect(() => restoreLimits({ MEITH_RESTORE_MAX_ARCHIVE_BYTES: '1.5' })).toThrow(
      /positive integer/,
    )
  })
})

describe('validateArchiveListing', () => {
  const limits = {
    archiveBytes: 1_000,
    members: 3,
    memberBytes: 100,
    expandedBytes: 150,
  }
  const files = new Set(['-'])

  it('accepts a small regular-file bundle', () => {
    expect(
      validateArchiveListing(
        'manifest.json\ndb.dump\n',
        '-rw------- 0/0 20 2026-08-21 00:00 manifest.json\n' +
          '-rw------- 0/0 80 2026-08-21 00:00 db.dump\n',
        limits,
        files,
      ).map((member) => member.name),
    ).toEqual(['manifest.json', 'db.dump'])
  })

  it.each([
    ['../escape', '-rw------- 0/0 1 2026-08-21 00:00 ../escape\n'],
    ['/absolute', '-rw------- 0/0 1 2026-08-21 00:00 /absolute\n'],
    ['link', 'lrwxrwxrwx 0/0 0 2026-08-21 00:00 link -> target\n'],
  ])('rejects unsafe member %s', (name, verbose) => {
    expect(() => validateArchiveListing(`${name}\n`, verbose, limits, files)).toThrow(
      /unsafe|unsupported/,
    )
  })

  it('rejects duplicates and quota violations', () => {
    expect(() =>
      validateArchiveListing(
        'same\nsame\n',
        '-rw------- 0/0 1 2026-08-21 00:00 same\n'.repeat(2),
        limits,
        files,
      ),
    ).toThrow(/duplicate/)
    expect(() =>
      validateArchiveListing(
        'large\n',
        '-rw------- 0/0 101 2026-08-21 00:00 large\n',
        limits,
        files,
      ),
    ).toThrow(/per-member/)
    expect(() =>
      validateArchiveListing(
        'one\ntwo\n',
        '-rw------- 0/0 80 2026-08-21 00:00 one\n' + '-rw------- 0/0 80 2026-08-21 00:00 two\n',
        limits,
        files,
      ),
    ).toThrow(/expanded-size/)
  })

  it('accepts the legacy uploads root but rejects special entries', () => {
    expect(
      validateArchiveListing(
        './\n./avatar.png\n',
        'drwx------ 0/0 0 2026-08-21 00:00 ./\n' +
          '-rw------- 0/0 20 2026-08-21 00:00 ./avatar.png\n',
        limits,
        new Set(['-', 'd']),
      ).map((member) => member.name),
    ).toEqual(['.', 'avatar.png'])
  })
})

describe('carrying a Blob store out and putting it back', () => {
  const TOKEN = 'vercel_blob_rw_store123_secretsecret'

  function fakeBlob(seed: ReadonlyMap<string, string> = new Map()): BlobLike & {
    objects: Map<string, Uint8Array>
  } {
    const objects = new Map<string, Uint8Array>()
    for (const [key, body] of seed) objects.set(key, new TextEncoder().encode(body))

    return {
      objects,
      put(pathname, body) {
        objects.set(pathname, new Uint8Array(body))
        return Promise.resolve({ pathname })
      },
      get(pathname) {
        const body = objects.get(pathname)
        if (body === undefined) return Promise.resolve(null)
        return Promise.resolve({
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(body)
              controller.close()
            },
          }),
        })
      },
      del(pathname) {
        objects.delete(pathname)
        return Promise.resolve()
      },
      list(options) {
        const all = [...objects.keys()].sort()
        const start = options.cursor === undefined ? 0 : Number(options.cursor)
        const page = all.slice(start, start + 2)
        const next = start + 2

        return Promise.resolve({
          blobs: page.map((pathname) => ({ pathname })),
          hasMore: next < all.length,
          cursor: next < all.length ? String(next) : undefined,
        })
      },
    }
  }

  let scratch: string

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'meith-blob-roundtrip-'))
  })

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  const CONTENT = new Map([
    ['attachments/a1/source', 'the first attachment'],
    ['attachments/a2/source', 'the second attachment'],
    ['attachments/a2/thumb', 'a thumbnail'],
    ['avatars/ab/deadbeef.png', 'avatar bytes'],
    ['logos/board.svg', '<svg/>'],
  ])

  it('pulls every object out, across more than one page', async () => {
    const store = new BlobFileStore({ token: TOKEN }, fakeBlob(CONTENT))
    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })

    const pulled = await drainStoreToDirectory(store, dir)

    expect(pulled).toBe(CONTENT.size)
    for (const [key, body] of CONTENT) {
      expect(await readFile(path.join(dir, key), 'utf8')).toBe(body)
    }
  })

  it('round-trips into a second store with the keys unchanged', async () => {
    const source = fakeBlob(CONTENT)
    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })
    await drainStoreToDirectory(new BlobFileStore({ token: TOKEN }, source), dir)

    const destination = fakeBlob()
    const pushed = await uploadDirectoryToStore(
      new BlobFileStore({ token: TOKEN }, destination),
      dir,
    )

    expect(pushed).toBe(CONTENT.size)
    expect([...destination.objects.keys()].sort()).toEqual([...CONTENT.keys()].sort())
    for (const [key, body] of CONTENT) {
      expect(new TextDecoder().decode(destination.objects.get(key))).toBe(body)
    }
  })

  it('restores into a bucket just as readily, which is the way off Vercel', async () => {
    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })
    await drainStoreToDirectory(new BlobFileStore({ token: TOKEN }, fakeBlob(CONTENT)), dir)

    const bucket = new Map<string, Uint8Array>()
    const pushed = await uploadDirectoryToStore(
      {
        put: (key, body, options) => {
          bucket.set(key, body)
          return Promise.resolve({ key, size: body.byteLength, contentType: options.contentType })
        },
      },
      dir,
    )

    expect(pushed).toBe(CONTENT.size)
    expect([...bucket.keys()].sort()).toEqual([...CONTENT.keys()].sort())
  })

  it('refuses to write an object whose key escapes the staging directory', async () => {
    const escaping = fakeBlob(new Map([['safe.txt', 'kept']]))
    escaping.list = () =>
      Promise.resolve({
        blobs: [{ pathname: '../escaped.txt' }, { pathname: 'safe.txt' }],
        hasMore: false,
      })
    escaping.objects.set('../escaped.txt', new TextEncoder().encode('should not land'))

    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })

    const pulled = await drainStoreToDirectory(new BlobFileStore({ token: TOKEN }, escaping), dir)

    expect(pulled).toBe(1)
    expect(await readdir(dir)).toEqual(['safe.txt'])
    await expect(stat(path.join(scratch, 'escaped.txt'))).rejects.toThrow()
  })
})
