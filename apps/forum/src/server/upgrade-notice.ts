import 'server-only'

/**
 * F84 — the ACP's "you have not run the upgrade" notice.
 *
 * The failure it prevents is the ordinary one: an operator deploys new code and
 * forgets the command, so the board runs new application logic against an old
 * schema and fails in whichever request happens to touch the missing column —
 * with an error naming a column rather than naming the upgrade.
 *
 * Read on the admin index only. It is one indexed lookup and the panel is not a
 * hot page, but putting it in the board's shell would be a query on every page
 * view for a message only an administrator can act on.
 */
import { env, logger } from '@forum/core'
import { appliedPluginMigrations, getDb, readVersion } from '@forum/db'
import type { PluginDefinition } from '@forum/plugin-kit'
import { planUpgrade, upgradeNotice, type UpgradeState } from '@forum/upgrade'

import forumConfig from '../../forum.config'

/** The version this deployment is. One constant, read by the notice and the CLI. */
export const CODE_VERSION = '0.1.0'

/**
 * The notice, or `null`.
 *
 * Failure-tolerant on purpose: a board whose `component_versions` table does not
 * exist yet — one installed before F84 — must show the panel, not a 500. The
 * absence of a recorded version is read as "current", because inventing a low
 * one would tell every pre-F84 board it is out of date on the day it upgrades.
 */
export async function pendingUpgradeNotice(): Promise<string | null> {
  if (env.DATA_SOURCE !== 'postgres') return null

  try {
    const db = getDb()
    const plugins = (forumConfig.plugins ?? [])
      .filter((entry) => entry.enabled !== false && entry.plugin !== undefined)
      .map((entry) => entry.plugin as PluginDefinition)

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
