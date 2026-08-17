import 'server-only'

import { CacheTags, cachedGlobal, env } from '@meith/core'
import { PostgresSettingsRepository, getDb } from '@meith/db'
import { drivers } from '@meith/drivers'
import { SettingsSnapshot } from '@meith/settings'

const TTL_SECONDS = 60

export async function getSettingOverrides(): Promise<ReadonlyMap<string, string>> {
  if (env.DATA_SOURCE !== 'postgres') {
    return new Map()
  }

  const overrides = await cachedGlobal<Array<[string, string]>>(
    drivers().cache,
    { key: ['settings', 'overrides'], tags: [CacheTags.settings()], revalidate: TTL_SECONDS },
    async () => {
      const stored = await new PostgresSettingsRepository(getDb()).loadAll()
      return [...stored] as Array<[string, string]>
    },
  )

  return new Map(overrides)
}

export async function getSettings(): Promise<SettingsSnapshot> {
  return SettingsSnapshot.fromOverrides(new Map(await getSettingOverrides()))
}

/**
 * The same settings, read past the cache.
 *
 * The cached snapshot is held per module instance, and a route handler is not
 * always the same instance as the render that invalidated it — so a route can
 * act on a value up to a minute out of date. That is harmless for anything the
 * page merely displays, and wrong for a decision an operator has just changed:
 * turning a sign-in provider on and having the button answer "that is not
 * switched on" reads as a broken board, not as a stale cache. Sign-in happens
 * once per member per session, so the query is cheaper than the confusion.
 */
export async function getSettingsUncached(): Promise<SettingsSnapshot> {
  if (env.DATA_SOURCE !== 'postgres') return SettingsSnapshot.fromOverrides(new Map())

  const stored = await new PostgresSettingsRepository(getDb()).loadAll()
  return SettingsSnapshot.fromOverrides(new Map(stored))
}
