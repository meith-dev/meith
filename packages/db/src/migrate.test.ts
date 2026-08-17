import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type postgres from 'postgres'
import { describe, expect, it } from 'vitest'

import {
  MIGRATION_LOCK_KEY,
  migrationFolderCandidates,
  migrationUrl,
  withMigrationLock,
} from './migrate'

const HERE = path.dirname(fileURLToPath(import.meta.url))

describe('where the migrations are looked for', () => {
  it('tries MIGRATIONS_DIR and nothing else when it is set', () => {
    expect(
      migrationFolderCandidates({ explicit: '/srv/sql', moduleDir: HERE, cwd: '/app' }),
    ).toEqual(['/srv/sql'])
  })

  it('prefers the folder beside this module, where a checkout has it', () => {
    const [first] = migrationFolderCandidates({ moduleDir: HERE, cwd: '/somewhere/else' })
    expect(first).toBe(path.resolve(HERE, '..', 'migrations'))
  })

  it('finds this repository’s own migrations that way', () => {
    const [first] = migrationFolderCandidates({ moduleDir: HERE, cwd: HERE })
    expect(existsSync(path.join(first ?? '', 'meta', '_journal.json'))).toBe(true)
  })

  it('looks where the image puts it, for the runtimes with no module directory', () => {
    expect(migrationFolderCandidates({ cwd: '/app' })).toContain('/app/migrations')
  })

  it('walks up from the working directory, in both shapes', () => {
    const candidates = migrationFolderCandidates({ cwd: '/repo/apps/community' })

    expect(candidates).toContain(path.join('/repo', 'packages', 'db', 'migrations'))
    expect(candidates).toContain(path.join('/repo/apps/community', 'migrations'))
  })

  it('stops at the root rather than looping', () => {
    const candidates = migrationFolderCandidates({ cwd: '/' })
    expect(candidates.length).toBeLessThan(10)
    expect(candidates).toContain(path.join('/', 'migrations'))
  })

  it('puts the nearest directory first, so a checkout never reaches the image path', () => {
    const candidates = migrationFolderCandidates({ moduleDir: HERE, cwd: '/repo/apps/community' })
    expect(candidates.indexOf(path.resolve(HERE, '..', 'migrations'))).toBe(0)
  })
})

describe('which connection the runner migrates on', () => {
  const POOLER = 'postgres://user:pw@pooler.example.test:6543/forum'
  const DIRECT = 'postgres://user:pw@db.example.test:5432/forum'

  it('prefers the direct URL, the one that can hold a session lock', () => {
    expect(migrationUrl({ DATABASE_URL: POOLER, DIRECT_DATABASE_URL: DIRECT })).toBe(DIRECT)
  })

  it('falls back to DATABASE_URL when no direct URL is configured', () => {
    expect(migrationUrl({ DATABASE_URL: POOLER })).toBe(POOLER)
  })

  it('refuses to migrate with neither', () => {
    expect(() => migrationUrl({})).toThrow(/DATABASE_URL/)
  })
})

function recordingConnection(): { statements: string[]; sql: ReturnType<typeof postgres> } {
  const statements: string[] = []

  const sql = ((strings: TemplateStringsArray, ...values: readonly unknown[]) => {
    statements.push(String.raw({ raw: strings }, ...values))
    return Promise.resolve([])
  }) as unknown as ReturnType<typeof postgres>

  return { statements, sql }
}

describe('the advisory lock that serialises concurrent deploys', () => {
  it('takes a session lock before the work and releases it after', async () => {
    const { statements, sql } = recordingConnection()

    await withMigrationLock(sql, async () => {
      statements.push('the migrator')
    })

    expect(statements).toEqual([
      `select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`,
      'the migrator',
      `select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`,
    ])
  })

  it('takes a session lock rather than a transaction one, which spans the run', async () => {
    const { statements, sql } = recordingConnection()

    await withMigrationLock(sql, async () => {})

    expect(statements[0]).not.toContain('xact')
  })

  it('releases the lock when the migration fails, so the next deploy is not blocked', async () => {
    const { statements, sql } = recordingConnection()

    await expect(
      withMigrationLock(sql, () => Promise.reject(new Error('migration exploded'))),
    ).rejects.toThrow('migration exploded')

    expect(statements[1]).toContain('pg_advisory_unlock')
  })

  it('holds one stable key, so two deploys of different versions still queue', () => {
    expect(MIGRATION_LOCK_KEY).toBe('-2943916371013839929')
    expect(BigInt(MIGRATION_LOCK_KEY)).toBeGreaterThanOrEqual(-(2n ** 63n))
  })
})
