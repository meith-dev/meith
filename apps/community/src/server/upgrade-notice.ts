import 'server-only'

import { env, logger } from '@meith/core'
import { appliedPluginMigrations, getDb, readVersion } from '@meith/db'
import { planUpgrade, type UpgradeState, upgradeNotice } from '@meith/upgrade'

import { activeDefinitions } from './plugin-host'

export const CODE_VERSION = '0.18.0'

export async function pendingUpgradeNotice(): Promise<string | null> {
  if (env.DATA_SOURCE !== 'postgres') return null

  try {
    const db = getDb()
    const plugins = activeDefinitions()

    const applied: Record<string, readonly string[]> = {}
    for (const plugin of plugins) {
      applied[plugin.key] = await appliedPluginMigrations(db, plugin.key)
    }

    const state: UpgradeState = {
      recordedVersion: (await readVersion(db, 'core')) ?? CODE_VERSION,
      codeVersion: CODE_VERSION,
      pendingCoreMigrations: [],
      plugins: plugins.map((plugin) => ({
        key: plugin.key,
        version: plugin.version,
        dependsOn: plugin.dependsOn ?? [],
        migrationIds: (plugin.migrations ?? []).map((migration) => migration.id),
      })),
      appliedPluginMigrations: applied,
    }

    return upgradeNotice(planUpgrade(state), state)
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not determine upgrade state')
    return null
  }
}
