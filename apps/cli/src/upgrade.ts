import {
  appliedPluginMigrations,
  applyPluginMigration,
  getDb,
  readVersion,
  recordVersion,
  runMigrations,
} from '@meith/db'
import type { PluginDefinition } from '@meith/plugin-kit'
import { planUpgrade, upgradeNotice, type PluginUpgrade } from '@meith/upgrade'

export const CODE_VERSION = '0.6.0'

export function pluginUpgrades(plugins: readonly PluginDefinition[]): readonly PluginUpgrade[] {
  return plugins.map((plugin) => ({
    key: plugin.key,
    version: plugin.version,
    dependsOn: plugin.dependsOn ?? [],
    migrationIds: (plugin.migrations ?? []).map((migration) => migration.id),
  }))
}

export interface UpgradeOptions {
  readonly dryRun: boolean
  readonly plugins: readonly PluginDefinition[]
  readonly log: (line: string) => void
}

export async function upgrade(options: UpgradeOptions): Promise<number> {
  const db = getDb()
  const plugins = pluginUpgrades(options.plugins)

  const recordedVersion = (await readVersion(db, 'core')) ?? CODE_VERSION

  const applied: Record<string, readonly string[]> = {}
  for (const plugin of plugins) {
    applied[plugin.key] = await appliedPluginMigrations(db, plugin.key)
  }

  const state = {
    recordedVersion,
    codeVersion: CODE_VERSION,
    pendingCoreMigrations: [] as readonly string[],
    plugins,
    appliedPluginMigrations: applied,
  }

  const plan = planUpgrade(state)

  if (plan.refusal !== null || plan.orderFailure !== null) {
    options.log(upgradeNotice(plan, state) ?? 'This board cannot be upgraded.')
    return 1
  }

  options.log(options.dryRun ? 'Plan:' : 'Upgrading…')
  options.log('  1. apply pending core migrations')

  let stepNumber = 2
  for (const plugin of plugins) {
    const pending = plugin.migrationIds.filter((id) => !(applied[plugin.key] ?? []).includes(id))
    if (pending.length === 0) continue
    options.log(`  ${stepNumber++}. ${plugin.key}: ${pending.join(', ')}`)
  }
  options.log(`  ${stepNumber}. record version ${CODE_VERSION}`)

  if (options.dryRun) {
    options.log('')
    options.log('Nothing was changed. Run without --dry-run to apply.')
    return 0
  }

  const count = await runMigrations()
  options.log(count === 0 ? 'Core: already up to date.' : `Core: applied ${count} migration(s).`)

  for (const plugin of plugins) {
    const definition = options.plugins.find((entry) => entry.key === plugin.key)
    for (const migration of definition?.migrations ?? []) {
      const ran = await applyPluginMigration(
        db,
        plugin.key,
        migration.id,
        migration.statements,
      )
      if (ran) options.log(`${plugin.key}: applied ${migration.id}.`)
    }
    await recordVersion(db, `plugin:${plugin.key}`, plugin.version)
  }

  await recordVersion(db, 'core', CODE_VERSION)
  options.log(`Recorded version ${CODE_VERSION}.`)
  return 0
}
