import 'server-only'

/**
 * Board settings, resolved once per request path that needs them (F08).
 *
 * Until F39 nothing in the app read a setting: the registry, its migration and
 * its CLI commands existed, but an operator running `forum settings:set
 * posting.flood_seconds 60` changed a row nothing consulted. Posting is the
 * first feature whose behaviour is configured, so this is where the read lands.
 *
 * Cached through F10's `cachedGlobal` under `CacheTags.settings()`, which is a
 * global tag by construction: settings are board-wide and identical for every
 * viewer, so this is exactly the shape the cache guard permits. Whoever writes a
 * setting invalidates that tag — the ACP screen is F64, and the CLI's writes are
 * out of process, which is why the entry also carries a short TTL rather than
 * relying on invalidation alone.
 */
import { CacheTags, cachedGlobal, env } from '@forum/core'
import { drivers } from '@forum/drivers'
import { SettingsSnapshot } from '@forum/settings'

/**
 * A CLI `settings:set` runs in another process and cannot invalidate this
 * cache, so an override takes at most a minute to be seen. Long enough to spare
 * the database on every composer render; short enough that an operator changing
 * the flood interval does not think it is broken.
 */
const TTL_SECONDS = 60

export async function getSettings(): Promise<SettingsSnapshot> {
  if (env.DATA_SOURCE !== 'postgres') {
    /*
     * Fixture mode has no `settings` table to read. Registry defaults are the
     * honest answer — every key still resolves, and nothing pretends an
     * override could have been stored.
     */
    return SettingsSnapshot.fromOverrides(new Map())
  }

  const overrides = await cachedGlobal<Array<[string, string]>>(
    drivers().cache,
    { key: ['settings', 'overrides'], tags: [CacheTags.settings()], revalidate: TTL_SECONDS },
    async () => {
      // Lazily required for the same reason the container's Postgres branch is:
      // fixture mode must not pull in postgres.js. See container.ts.
      const { getDb, PostgresSettingsRepository } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- justified lazy infra load
        require('@forum/db') as typeof import('@forum/db')

      const stored = await new PostgresSettingsRepository(getDb()).loadAll()
      // A Map does not survive the cache driver's serialisation; entries do.
      return [...stored] as Array<[string, string]>
    },
  )

  return SettingsSnapshot.fromOverrides(new Map(overrides))
}
