/**
 * The permission version bump, written once.
 *
 * F20 resolves an Actor and caches it against `cache_versions['permissions']`.
 * Anything that changes a permission *input* — a group's defaults, a forum
 * override, which group somebody is in, whether their account is active — has
 * to move that number, **inside the same transaction as the write it belongs
 * to**. A bump that can be lost while the write survives leaves everybody
 * holding permissions that have been revoked, for the cache's lifetime.
 *
 * It lives here rather than in each repository because there are now three
 * writers of it and the pairing is the part that must not drift: a repository
 * that did the increment in a second transaction would look identical in
 * review and be wrong under a crash.
 */
import { sql } from 'drizzle-orm'

import type { Database } from './client'

/** A transaction handle, as `db.transaction` hands one to its callback. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Increment the permission version. Call inside the transaction that writes. */
export async function bumpPermissionVersion(tx: Tx): Promise<void> {
  await tx.execute(sql`
    insert into cache_versions (key, version) values ('permissions', 1)
    on conflict (key) do update
       set version = cache_versions.version + 1, bumped_at = now()
  `)
}

/**
 * Run `work` in a transaction and bump the version with it.
 *
 * Not two calls a caller could get half right: a refusal inside `work` rolls
 * the bump back with everything else, and there is no ordering in which the
 * write commits without it.
 */
export async function withPermissionVersionBump<T>(
  db: Database,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await work(tx)
    await bumpPermissionVersion(tx)
    return result
  })
}
