import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ConfigurationError, env, logger } from '@meith/core'

function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', 'migrations')
}

export async function runMigrations(options: {
  readonly folder?: string
} = {}): Promise<number> {
  const url = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL

  if (!url) {
    throw new ConfigurationError(
      'Cannot migrate without DATABASE_URL (or DIRECT_DATABASE_URL).',
    )
  }

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    const before = await appliedCount(sql)
    await migrate(drizzle(sql), { migrationsFolder: options.folder ?? migrationsFolder() })
    const after = await appliedCount(sql)

    const applied = after - before
    logger({ component: 'migrate' }).info({ applied }, 'migrations applied')
    return applied
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
