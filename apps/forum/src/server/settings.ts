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
import { CacheTags, cachedGlobal, env } from '@meith/core'
/* Statically imported; see `theme-runtime.ts` and `container.ts` for why. */
import { PostgresSettingsRepository, getDb } from '@meith/db'
import { drivers } from '@meith/drivers'
import { SettingsSnapshot } from '@meith/settings'

/**
 * A CLI `settings:set` runs in another process and cannot invalidate this
 * cache, so an override takes at most a minute to be seen. Long enough to spare
 * the database on every composer render; short enough that an operator changing
 * the flood interval does not think it is broken.
 */
const TTL_SECONDS = 60

/**
 * Every stored row, before the registry has had an opinion about it.
 *
 * Exported because the registry is not the only thing keyed into this table: a
 * plugin's settings and its operator switch live at `plugin.<key>.…` (F69), and
 * `SettingsSnapshot` deliberately resolves *declared* keys only, so a caller
 * that went through it would find nothing. Sharing the cached read is the point
 * — the plugin screens and the ACP's disable switch cost no query at all,
 * because the settings table has already been fetched for this request.
 */
export async function getSettingOverrides(): Promise<ReadonlyMap<string, string>> {
  if (env.DATA_SOURCE !== 'postgres') {
    /*
     * Fixture mode has no `settings` table to read. Registry defaults are the
     * honest answer — every key still resolves, and nothing pretends an
     * override could have been stored.
     */
    return new Map()
  }

  const overrides = await cachedGlobal<Array<[string, string]>>(
    drivers().cache,
    { key: ['settings', 'overrides'], tags: [CacheTags.settings()], revalidate: TTL_SECONDS },
    async () => {
      const stored = await new PostgresSettingsRepository(getDb()).loadAll()
      // A Map does not survive the cache driver's serialisation; entries do.
      return [...stored] as Array<[string, string]>
    },
  )

  return new Map(overrides)
}

export async function getSettings(): Promise<SettingsSnapshot> {
  return SettingsSnapshot.fromOverrides(new Map(await getSettingOverrides()))
}
