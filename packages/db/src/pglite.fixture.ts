import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import type { Database } from './client'
import * as schema from './schema'

export interface QueryLog {
  readonly count: number
  readonly statements: readonly string[]
  reset(): void
}

export interface TestDb {
  readonly db: Database
  readonly queries: QueryLog
  /**
   * The engine underneath, for the few tests that need to send it something
   * drizzle cannot: `exec()` takes a script of several statements, which is how
   * the migration files arrive and what a prepared statement refuses.
   */
  readonly client: PGlite
  close(): Promise<void>
}

/** The checked-in migrations, as one script `client.exec()` will accept. */
export function migrationScript(): string {
  return migrationSql().split('--> statement-breakpoint').join('\n')
}

function migrationSql(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dir = path.resolve(here, '..', 'migrations')

  const journal = JSON.parse(readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[]
  }

  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(path.join(dir, `${entry.tag}.sql`), 'utf8'))
    .join('\n')
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()

  await client.exec(migrationScript())

  const statements: string[] = []

  const originalQuery = client.query.bind(client)
  ;(client as unknown as { query: typeof originalQuery }).query = ((
    sqlText: string,
    ...rest: unknown[]
  ) => {
    statements.push(sqlText)
    return (originalQuery as (...a: unknown[]) => unknown)(sqlText, ...rest)
  }) as typeof originalQuery

  const db = drizzle(client, {
    schema,
    casing: 'snake_case',
  }) as unknown as Database

  return {
    db,
    client,
    queries: {
      get count() {
        return statements.length
      },
      get statements() {
        return [...statements]
      },
      reset() {
        statements.length = 0
      },
    },
    async close() {
      await client.close()
    },
  }
}
