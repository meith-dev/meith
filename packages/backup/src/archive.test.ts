import { describe, expect, it } from 'vitest'

import { restoreLimits, validateArchiveListing } from './archive'
import { postgresClientEnvironment } from './postgres-client'

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
        '-rw------- 0/0 80 2026-08-21 00:00 one\n-rw------- 0/0 80 2026-08-21 00:00 two\n',
        limits,
        files,
      ),
    ).toThrow(/expanded-size/)
  })

  it('reads the size from a bsdtar listing, where the owner is two fields', () => {
    expect(
      validateArchiveListing(
        'manifest.json\ndb.dump\n',
        '-rw-------  0 nextjs nogroup 20 Sep  4 10:57 manifest.json\n' +
          '-rw-------  0 nextjs nogroup 80 Sep  4 10:57 db.dump\n',
        limits,
        files,
      ).map((member) => member.size),
    ).toEqual([20, 80])
    expect(() =>
      validateArchiveListing(
        'large\n',
        '-rw-------  0 nextjs nogroup 101 Sep  4 10:57 large\n',
        limits,
        files,
      ),
    ).toThrow(/per-member/)
  })

  it('accepts the legacy uploads root but rejects special entries', () => {
    expect(
      validateArchiveListing(
        './\n./avatar.png\n',
        'drwx------ 0/0 0 2026-08-21 00:00 ./\n-rw------- 0/0 20 2026-08-21 00:00 ./avatar.png\n',
        limits,
        new Set(['-', 'd']),
      ).map((member) => member.name),
    ).toEqual(['.', 'avatar.png'])
  })
})
