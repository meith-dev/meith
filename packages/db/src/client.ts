import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env, ConfigurationError } from '@meith/core'

import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

interface DbGlobal {
  __forumSql: ReturnType<typeof postgres> | undefined
  __forumDb: Database | undefined
}

const globalRef = globalThis as unknown as DbGlobal

function connectionOptions() {
  return {
    max: env.DATABASE_POOL_MAX,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    onnotice: () => {},
  } as const
}

export function getDb(): Database {
  if (env.DATA_SOURCE !== 'postgres') {
    throw new ConfigurationError(
      'getDb() called while DATA_SOURCE is "' +
        env.DATA_SOURCE +
        '". A repository is talking to Postgres directly instead of going ' +
        'through its driver. Fix the call site, do not set DATABASE_URL.',
    )
  }

  if (globalRef.__forumDb) return globalRef.__forumDb

  const url = env.DATABASE_URL
  if (!url) {
    throw new ConfigurationError(
      'DATABASE_URL is required when DATA_SOURCE is "postgres".',
    )
  }

  const sql = postgres(url, connectionOptions())
  const db = drizzle(sql, { schema, casing: 'snake_case' })
  restoreDateSerialisers(sql)

  globalRef.__forumSql = sql
  globalRef.__forumDb = db

  return db
}

const DATE_OIDS = ['1184', '1114', '1082', '1083', '1182', '1185', '1115', '1231'] as const

function restoreDateSerialisers(client: ReturnType<typeof postgres>): void {
  const serialisers = (
    client as unknown as { options: { serializers: Record<string, (v: unknown) => unknown> } }
  ).options.serializers
  for (const oid of DATE_OIDS) {
    serialisers[oid] = (value: unknown) =>
      value instanceof Date ? value.toISOString() : value
  }
}

export function createIsolatedDb(url: string, poolMax = 1) {
  const sql = postgres(url, { ...connectionOptions(), max: poolMax })
  const db = drizzle(sql, { schema, casing: 'snake_case' })
  restoreDateSerialisers(sql)
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  }
}

export async function closeDb(): Promise<void> {
  const sql = globalRef.__forumSql
  if (!sql) return
  await sql.end({ timeout: 5 })
  globalRef.__forumSql = undefined
  globalRef.__forumDb = undefined
}

export { schema }
