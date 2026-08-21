import { describe, expect, it } from 'vitest'

import {
  bundleName,
  contentTypeFor,
  formatBytes,
  parseManifest,
  postgresClientEnvironment,
  resolveUploadsMode,
  restoreDatabaseUrl,
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
