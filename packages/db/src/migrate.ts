/**
 * F03 — migration runner.
 *
 * Separate from `client.ts` because it needs a *different* connection shape: the
 * app runs through a transaction-mode pooler with `prepare: false` and a tiny
 * pool, whereas migrations need a single direct session that can hold advisory
 * locks and run DDL in a transaction.
 */

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ConfigurationError, env, logger } from '@forum/core'

/** Absolute path to the generated SQL, resolved relative to this file. */
function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', 'migrations')
}

/**
 * Applies every pending migration, then closes its own connection.
 *
 * Uses `DIRECT_DATABASE_URL` when present. Running DDL through a transaction-mode
 * pooler is unreliable: the pooler may hand successive statements to different
 * backends, so an advisory lock taken by one statement is invisible to the next
 * and two concurrent deploys can interleave DDL.
 */
export async function runMigrations(): Promise<number> {
  const url = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL

  if (!url) {
    throw new ConfigurationError(
      'Cannot migrate without DATABASE_URL (or DIRECT_DATABASE_URL).',
    )
  }

  /*
   * max: 1 is required, not an optimisation. drizzle's migrator takes a
   * session-level advisory lock so concurrent deploys serialise; that lock is
   * only meaningful if every statement runs on the same connection.
   */
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    const before = await appliedCount(sql)
    await migrate(drizzle(sql), { migrationsFolder: migrationsFolder() })
    const after = await appliedCount(sql)

    const applied = after - before
    logger({ component: 'migrate' }).info({ applied }, 'migrations applied')
    return applied
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * Counts rows in drizzle's bookkeeping table, tolerating its absence on a
 * first-ever run (when the table itself has not been created).
 */
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
