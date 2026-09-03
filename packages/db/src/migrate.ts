import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from 'drizzle-orm'
import postgres from 'postgres'

import { ConfigurationError, env, logger } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'

const JOURNAL = path.join('meta', '_journal.json')

const IMAGE_MIGRATIONS = '/app/migrations'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

export const MIGRATIONS_TABLE = 'drizzle.__drizzle_migrations'

export interface Migration {
  readonly tag: string
  readonly hash: string
  readonly when: number
  readonly statements: readonly string[]
}

export interface MigrationExecutor {
  exec(statement: string): Promise<void>
  query<T>(statement: string): Promise<readonly T[]>
  transaction(work: (exec: (statement: string) => Promise<void>) => Promise<void>): Promise<void>
}

export function migrationFolderCandidates(input: {
  readonly explicit?: string | undefined
  readonly moduleDir?: string | undefined
  readonly cwd: string
}): readonly string[] {
  if (input.explicit !== undefined && input.explicit !== '') return [input.explicit]

  const candidates: string[] = []

  if (input.moduleDir !== undefined && input.moduleDir !== '') {
    candidates.push(path.resolve(input.moduleDir, '..', 'migrations'))
  }

  candidates.push(IMAGE_MIGRATIONS)

  let dir = path.resolve(input.cwd)
  for (;;) {
    candidates.push(path.join(dir, 'migrations'))
    candidates.push(path.join(dir, 'packages', 'db', 'migrations'))
    candidates.push(path.join(dir, 'node_modules', '@meith', 'db', 'migrations'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return candidates
}

function moduleDir(): string | undefined {
  try {
    return path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return undefined
  }
}

function migrationsFolder(): string {
  const candidates = migrationFolderCandidates({
    explicit: env.MIGRATIONS_DIR,
    moduleDir: moduleDir(),
    cwd: process.cwd(),
  })

  const found = candidates.find((folder) => existsSync(path.join(folder, JOURNAL)))
  if (found !== undefined) return found

  throw new ConfigurationError(
    'Cannot find the migrations. Set MIGRATIONS_DIR to the folder holding ' +
      `meta/_journal.json — looked in ${candidates.slice(0, 4).join(', ')}.`,
  )
}

export function readMigrations(folder: string): readonly Migration[] {
  const journal = JSON.parse(readFileSync(path.join(folder, JOURNAL), 'utf8')) as {
    readonly entries: readonly { readonly tag: string; readonly when: number }[]
  }

  return journal.entries.map((entry) => {
    if (!Number.isSafeInteger(entry.when)) {
      throw new ConfigurationError(`Migration ${entry.tag} has no usable timestamp in the journal.`)
    }

    const source = readFileSync(path.join(folder, `${entry.tag}.sql`), 'utf8')

    return {
      tag: entry.tag,
      when: entry.when,
      hash: createHash('sha256').update(source).digest('hex'),
      statements: source.split(STATEMENT_BREAKPOINT).filter((statement) => statement.trim() !== ''),
    }
  })
}

async function appliedHashes(client: MigrationExecutor): Promise<ReadonlySet<string>> {
  const [table] = await client.query<{ found: string | null }>(
    `select to_regclass('${MIGRATIONS_TABLE}')::text as found`,
  )
  if (table === undefined || table.found === null) return new Set()

  const rows = await client.query<{ hash: string }>(`select hash from ${MIGRATIONS_TABLE}`)
  return new Set(rows.map((row) => row.hash))
}

export async function pendingMigrations(
  client: MigrationExecutor,
  migrations: readonly Migration[],
): Promise<readonly Migration[]> {
  const applied = await appliedHashes(client)
  return migrations.filter((migration) => !applied.has(migration.hash))
}

export async function applyMigrations(
  client: MigrationExecutor,
  migrations: readonly Migration[],
): Promise<readonly Migration[]> {
  const pending = await pendingMigrations(client, migrations)
  if (pending.length === 0) return pending

  await client.exec('create schema if not exists drizzle')
  await client.exec(
    `create table if not exists ${MIGRATIONS_TABLE} (id serial primary key, ` +
      'hash text not null, created_at bigint)',
  )

  await client.transaction(async (exec) => {
    for (const migration of pending) {
      for (const statement of migration.statements) await exec(statement)
      await exec(
        `insert into ${MIGRATIONS_TABLE} ("hash", "created_at") ` +
          `values ('${migration.hash}', ${migration.when})`,
      )
    }
  })

  return pending
}

function databaseExecutor(db: Database): MigrationExecutor {
  return {
    async exec(statement) {
      await db.execute(sql.raw(statement))
    },
    async query<T>(statement: string) {
      return resultRows<T>(await db.execute(sql.raw(statement)))
    },
    async transaction(work) {
      await db.transaction(async (tx) => {
        await work(async (statement) => {
          await tx.execute(sql.raw(statement))
        })
      })
    },
  }
}

export async function pendingCoreMigrations(db: Database): Promise<readonly string[]> {
  const migrations = readMigrations(migrationsFolder())
  const pending = await pendingMigrations(databaseExecutor(db), migrations)
  return pending.map((migration) => migration.tag)
}

export const MIGRATION_LOCK_KEY = '-2943916371013839929'

export function migrationUrl(source: {
  readonly DIRECT_DATABASE_URL?: string | undefined
  readonly DATABASE_URL?: string | undefined
}): string {
  const url = source.DIRECT_DATABASE_URL ?? source.DATABASE_URL

  if (!url) {
    throw new ConfigurationError('Cannot migrate without DATABASE_URL (or DIRECT_DATABASE_URL).')
  }

  return url
}

export async function withMigrationLock<T>(
  sql: ReturnType<typeof postgres>,
  work: () => Promise<T>,
): Promise<T> {
  await sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`

  try {
    return await work()
  } finally {
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`
  }
}

function postgresExecutor(sql: ReturnType<typeof postgres>): MigrationExecutor {
  return {
    async exec(statement) {
      await sql.unsafe(statement)
    },
    async query<T>(statement: string) {
      return (await sql.unsafe(statement)) as unknown as readonly T[]
    },
    async transaction(work) {
      await sql.begin(async (tx) => {
        await work(async (statement) => {
          await tx.unsafe(statement)
        })
      })
    },
  }
}

export async function runMigrations(
  options: { readonly folder?: string; readonly url?: string } = {},
): Promise<number> {
  const url = options.url ?? migrationUrl(env)
  const migrations = readMigrations(options.folder ?? migrationsFolder())

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    return await withMigrationLock(sql, async () => {
      const applied = await applyMigrations(postgresExecutor(sql), migrations)

      logger({ component: 'migrate' }).info(
        { applied: applied.length, tags: applied.map((migration) => migration.tag) },
        'migrations applied',
      )
      return applied.length
    })
  } finally {
    await sql.end({ timeout: 5 })
  }
}
