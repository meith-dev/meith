/**
 * F03 — the single Postgres connection for the entire process.
 *
 * Three things here are load-bearing and easy to break:
 *
 * 1. `prepare: false`. Supabase/Neon poolers in *transaction* mode hand a
 *    different backend to each statement, so a named prepared statement created
 *    on one backend will not exist on the next. postgres.js would otherwise
 *    silently use the extended protocol and fail under load with
 *    "prepared statement 's1' does not exist". This must stay false for any
 *    pgbouncer-style pooler.
 *
 * 2. `max`. Serverless functions scale horizontally, so every instance holds
 *    its own pool. A large `max` multiplied by N instances exhausts Postgres'
 *    connection limit. Small pool, many instances is correct here.
 *
 * 3. The `globalThis` singleton. Next's dev server re-evaluates modules on
 *    every HMR pass; without the cache each edit leaks a pool until Postgres
 *    refuses new connections.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env, ConfigurationError } from '@meith/core'

import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

/** Shape of the cache we hang off globalThis. Keyed to avoid collisions. */
interface DbGlobal {
  /*
   * `| undefined` is explicit rather than relying on `?` because
   * `exactOptionalPropertyTypes` distinguishes "absent" from
   * "present and undefined", and closeDb() assigns undefined to reset.
   */
  __forumSql: ReturnType<typeof postgres> | undefined
  __forumDb: Database | undefined
}

const globalRef = globalThis as unknown as DbGlobal

/**
 * postgres.js options shared by every connection.
 *
 * `idle_timeout` and `max_lifetime` matter on serverless: an idle socket to a
 * pooler that has already dropped its side produces ECONNRESET on the next
 * checkout, so we recycle sockets well before that.
 */
function connectionOptions() {
  return {
    max: env.DATABASE_POOL_MAX,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    /*
     * postgres.js logs notices to stderr by default, which is noise in tests
     * and leaks table names into logs. Route them nowhere; real errors still
     * throw.
     */
    onnotice: () => {},
  } as const
}

/**
 * Returns the process-wide `Database`. Safe to call from anywhere, including
 * module top-level, because it does not connect eagerly — postgres.js opens
 * sockets lazily on the first query.
 *
 * Throws ConfigurationError if called while DATA_SOURCE is `fixture`, because
 * reaching here in fixture mode means a repository bypassed its driver seam.
 * That is a wiring bug, not a runtime condition, so it must fail loudly.
 */
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
    // Unreachable via env validation, but keeps the type narrow and the
    // failure legible if validation is ever relaxed.
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

/**
 * Restore `Date` serialisation that `drizzle()` disables.
 *
 * `drizzle(client)` overwrites postgres.js's serialisers for every date and
 * timestamp OID (1184 timestamptz, 1114 timestamp, 1082 date, …) with a
 * transparent passthrough, `(v) => v`. That is deliberate on drizzle's side and
 * correct for the query builder: a *typed* column maps its JS value through
 * `mapToDriverValue` first, so postgres.js only ever receives a string and the
 * passthrough is exactly right.
 *
 * It is wrong for a **raw `sql` template**, which is what most of this package
 * writes. A bare value in a template gets drizzle's noop encoder, so a `Date`
 * arrives at the passthrough as a `Date`, and postgres.js then calls
 * `Buffer.byteLength()` on it:
 *
 *     TypeError: The "string" argument must be of type string or an instance
 *     of Buffer or ArrayBuffer. Received an instance of Date
 *
 * **Every test in this repository runs against PGlite, which does not go
 * through these serialisers and accepts a `Date` happily** — so the whole
 * write path looked correct and failed the first time it met a real server.
 * That is F11's recorded PGlite-substitution gap, and this is it biting; see
 * `client.pg.test.ts`, which runs against real Postgres precisely so it cannot
 * happen again.
 *
 * Reinstating a serialiser rather than converting at ~50 call sites is the fix
 * because it is one place and cannot be forgotten by the next query. It is
 * deliberately narrow: a string passes through untouched, exactly as drizzle
 * intends, so the query builder's behaviour is unchanged. Only a `Date` — which
 * previously threw — is converted.
 */
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

/**
 * Builds an isolated connection that is *not* cached globally. Used by the
 * migration runner and by integration tests that need a dedicated pool they
 * can close deterministically.
 */
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

/**
 * Closes the shared pool. Only for test teardown and CLI commands that must
 * let the process exit; request handlers should never call this.
 */
export async function closeDb(): Promise<void> {
  const sql = globalRef.__forumSql
  if (!sql) return
  await sql.end({ timeout: 5 })
  globalRef.__forumSql = undefined
  globalRef.__forumDb = undefined
}

export { schema }
