/**
 * F83 — the installer's two probes and its one write.
 *
 * Everything here has to work on a database with **no tables at all**, which is
 * the constraint that shapes it: the installer's whole job is to run before the
 * schema exists, so a query against a missing table is an expected answer rather
 * than an error to propagate.
 */

import { sql } from 'drizzle-orm'

import type { Database } from './client'

/**
 * Is the one-time marker set?
 *
 * A missing table reads as "not installed", which is correct and is the normal
 * case: before migrations run, `install_state` does not exist. Distinguishing
 * "no table" from "no row" would be a distinction with one behaviour.
 */
export async function isInstalled(db: Database): Promise<boolean> {
  try {
    const rows = (await db.execute(sql`select 1 from install_state where id = 1`)) as unknown as unknown[]
    return rows.length > 0
  } catch {
    return false
  }
}

/**
 * How many accounts exist, or `null` when the question cannot be asked.
 *
 * `null` rather than 0 for a missing table, and the difference is load-bearing:
 * the preflight treats a non-zero count as a blocker, and reading "no table" as
 * zero is right, while reading a *connection failure* as zero would let an
 * install proceed against a board it could not see.
 */
export async function countUsers(db: Database): Promise<number | null> {
  try {
    const rows = (await db.execute(sql`select count(*)::int as total from users`)) as unknown as {
      total: number
    }[]
    return rows[0]?.total ?? 0
  } catch {
    return null
  }
}

/** Can this database be reached at all? One trivial round trip. */
export async function canConnect(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}

/**
 * Set the marker. The last thing an install does, and it cannot be undone.
 *
 * `on conflict do nothing`, so a concurrent second attempt writes nothing rather
 * than raising — the caller has already been refused by the preflight, and an
 * installer whose final step can throw a primary-key violation is one that
 * reports failure after succeeding.
 */
export async function markInstalled(db: Database, version: string): Promise<void> {
  await db.execute(sql`
    insert into install_state (id, installed_version)
    values (1, ${version})
    on conflict (id) do nothing
  `)
}
