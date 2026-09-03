import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate as drizzleMigrate } from 'drizzle-orm/pglite/migrator'
import type postgres from 'postgres'
import { describe, expect, it } from 'vitest'

import type { Database } from './client'
import {
  applyMigrations,
  MIGRATION_LOCK_KEY,
  MIGRATIONS_TABLE,
  type MigrationExecutor,
  migrationFolderCandidates,
  migrationUrl,
  pendingCoreMigrations,
  pendingMigrations,
  readMigrations,
  withMigrationLock,
} from './migrate'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const FOLDER = path.resolve(HERE, '..', 'migrations')

function pgliteExecutor(client: PGlite): MigrationExecutor {
  return {
    async exec(statement) {
      await client.exec(statement)
    },
    async query<T>(statement: string) {
      return (await client.query<T>(statement)).rows
    },
    async transaction(work) {
      await client.transaction(async (tx) => {
        await work(async (statement) => {
          await tx.exec(statement)
        })
      })
    },
  }
}

function journal(
  entries: readonly { readonly tag: string; readonly when: number; readonly sql: string }[],
): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'meith-migrate-'))
  mkdirSync(path.join(folder, 'meta'))
  writeFileSync(
    path.join(folder, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: entries.map((entry, idx) => ({
        idx,
        version: '7',
        when: entry.when,
        tag: entry.tag,
        breakpoints: true,
      })),
    }),
  )
  for (const entry of entries) writeFileSync(path.join(folder, `${entry.tag}.sql`), entry.sql)
  return folder
}

async function tableExists(client: PGlite, name: string): Promise<boolean> {
  const { rows } = await client.query<{ found: string | null }>(
    `select to_regclass('${name}')::text as found`,
  )
  return rows[0]?.found !== null
}

async function recorded(client: PGlite): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from ${MIGRATIONS_TABLE}`,
  )
  return rows[0]?.n ?? -1
}

describe('which migrations a run applies', () => {
  it('applies the whole journal to an empty database, in journal order, then nothing', async () => {
    const client = new PGlite()
    try {
      const migrations = readMigrations(FOLDER)

      const applied = await applyMigrations(pgliteExecutor(client), migrations)
      expect(applied.map((m) => m.tag)).toEqual(migrations.map((m) => m.tag))

      expect(await applyMigrations(pgliteExecutor(client), migrations)).toEqual([])
      expect(await recorded(client)).toBe(migrations.length)
    } finally {
      await client.close()
    }
  }, 60_000)

  it('records the hash drizzle records, so rows written by either runner count for both', () => {
    const ours = readMigrations(FOLDER).map((m) => m.hash)
    const theirs = readMigrationFiles({ migrationsFolder: FOLDER }).map((m) => m.hash)

    expect(ours).toEqual(theirs)
  })

  it('applies a migration whose journal timestamp is older than one already applied', async () => {
    const folder = journal([
      { tag: '0000_one', when: 100, sql: 'create table one (n int);' },
      { tag: '0001_two', when: 300, sql: 'create table two (n int);' },
      { tag: '0002_three', when: 200, sql: 'create table three (n int);' },
    ])
    const client = new PGlite()
    try {
      const all = readMigrations(folder)
      await applyMigrations(pgliteExecutor(client), all.slice(0, 2))

      const applied = await applyMigrations(pgliteExecutor(client), all)

      expect(applied.map((m) => m.tag)).toEqual(['0002_three'])
      expect(await tableExists(client, 'three')).toBe(true)
    } finally {
      await client.close()
    }
  })

  it('brings a board last migrated at 0061 forward through everything after it', async () => {
    const migrations = readMigrations(FOLDER)
    const at = migrations.findIndex((m) => m.tag === '0061_task_schedule')
    expect(at).toBeGreaterThan(0)

    const client = new PGlite()
    try {
      await applyMigrations(pgliteExecutor(client), migrations.slice(0, at + 1))

      const applied = await applyMigrations(pgliteExecutor(client), migrations)

      expect(applied.map((m) => m.tag)).toEqual(migrations.slice(at + 1).map((m) => m.tag))
      expect(applied.map((m) => m.tag)).toContain('0063_board_digest')

      const { rows } = await client.query<{ present: boolean }>(
        "select exists (select 1 from information_schema.columns where table_name = 'users' " +
          "and column_name = 'board_digest_cadence') as present",
      )
      expect(rows[0]?.present).toBe(true)
    } finally {
      await client.close()
    }
  }, 60_000)

  it('skips what drizzle’s own runner already recorded', async () => {
    const folder = journal([
      { tag: '0000_one', when: 100, sql: 'create table one (n int);' },
      { tag: '0001_two', when: 200, sql: 'create table two (n int);' },
    ])
    const client = new PGlite()
    try {
      await drizzleMigrate(drizzle(client), { migrationsFolder: folder })

      expect(await applyMigrations(pgliteExecutor(client), readMigrations(folder))).toEqual([])
      expect(await recorded(client)).toBe(2)
    } finally {
      await client.close()
    }
  })

  it('applies and records nothing when one migration fails', async () => {
    const folder = journal([
      { tag: '0000_one', when: 100, sql: 'create table one (n int);' },
      {
        tag: '0001_bad',
        when: 200,
        sql: 'create table two (n int);--> statement-breakpoint\nthis is not sql;',
      },
    ])
    const client = new PGlite()
    try {
      await expect(
        applyMigrations(pgliteExecutor(client), readMigrations(folder)),
      ).rejects.toThrow()

      expect(await tableExists(client, 'one')).toBe(false)
      expect(await recorded(client)).toBe(0)
    } finally {
      await client.close()
    }
  })

  it('refuses a journal entry without a usable timestamp', () => {
    const folder = journal([{ tag: '0000_one', when: Number.NaN, sql: 'select 1;' }])

    expect(() => readMigrations(folder)).toThrow(/timestamp/)
  })
})

describe('asking what is pending without applying anything', () => {
  it('reports every migration on a database that has never been migrated, and creates nothing', async () => {
    const client = new PGlite()
    try {
      const migrations = readMigrations(FOLDER)

      const pending = await pendingMigrations(pgliteExecutor(client), migrations)

      expect(pending.map((m) => m.tag)).toEqual(migrations.map((m) => m.tag))
      expect(await tableExists(client, MIGRATIONS_TABLE)).toBe(false)
    } finally {
      await client.close()
    }
  })

  it('answers over the board’s own connection, by tag', async () => {
    const client = new PGlite()
    try {
      const db = drizzle(client) as unknown as Database
      const migrations = readMigrations(FOLDER)

      expect(await pendingCoreMigrations(db)).toEqual(migrations.map((m) => m.tag))

      await applyMigrations(pgliteExecutor(client), migrations)

      expect(await pendingCoreMigrations(db)).toEqual([])
    } finally {
      await client.close()
    }
  }, 60_000)
})

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

  it('looks inside an installed @meith/db, which is where a scaffolded board keeps them', () => {
    const candidates = migrationFolderCandidates({ cwd: '/board' })

    expect(candidates).toContain(path.join('/board', 'node_modules', '@meith', 'db', 'migrations'))
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
