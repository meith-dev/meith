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
