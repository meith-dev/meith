import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { ConfigurationError, env, logger } from '@meith/core'

const JOURNAL = path.join('meta', '_journal.json')

const IMAGE_MIGRATIONS = '/app/migrations'

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

export async function runMigrations(
  options: { readonly folder?: string; readonly url?: string } = {},
): Promise<number> {
  const url = options.url ?? migrationUrl(env)

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    return await withMigrationLock(sql, async () => {
      const before = await appliedCount(sql)
      await migrate(drizzle(sql), { migrationsFolder: options.folder ?? migrationsFolder() })
      const after = await appliedCount(sql)

      const applied = after - before
      logger({ component: 'migrate' }).info({ applied }, 'migrations applied')
      return applied
    })
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function appliedCount(sql: ReturnType<typeof postgres>): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM information_schema.tables
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
  `

  if (rows[0]?.count === '0') return 0

  const applied = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations
  `
  return Number(applied[0]?.count ?? '0')
}
