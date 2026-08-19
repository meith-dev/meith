import {
  appliedPluginMigrations,
  applyPluginMigration,
  getDb,
  PostgresNavigationRepository,
  readVersion,
  recordVersion,
  runMigrations,
} from '@meith/db'
import { type PluginDefinition, pluginNavigationPlacements } from '@meith/plugin-kit'
import { runPluginLifecycle } from '@meith/runtime'
import { type PluginUpgrade, planUpgrade, upgradeNotice } from '@meith/upgrade'

export const CODE_VERSION = '0.9.0'

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

  const fresh: string[] = []
  for (const plugin of options.plugins) {
    if ((await readVersion(db, `plugin:${plugin.key}`)) === null) fresh.push(plugin.key)
  }

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
  for (const key of fresh) {
    if (options.plugins.find((plugin) => plugin.key === key)?.onInstall === undefined) continue
    options.log(`  ${stepNumber++}. ${key}: onInstall`)
  }
  options.log(`  ${stepNumber++}. reconcile plugin navigation`)
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
      const ran = await applyPluginMigration(db, plugin.key, migration.id, migration.statements)
      if (ran) options.log(`${plugin.key}: applied ${migration.id}.`)
    }
    /*
     * onInstall runs after this plugin's migrations, so its tables exist, and
     * before the version row that will stop it running again. A throw here
     * stops the upgrade: a plugin that could not finish installing is one the
     * board should not start serving.
     */
    if (fresh.includes(plugin.key) && definition !== undefined) {
      const { ran } = await runPluginLifecycle({ db, plugin: definition, phase: 'install' })
      if (ran) options.log(`${plugin.key}: onInstall.`)
    }

    await recordVersion(db, `plugin:${plugin.key}`, plugin.version)
  }

  const navigation = await new PostgresNavigationRepository(db).syncPluginItems(
    pluginNavigationPlacements(options.plugins).map((item) => ({
      key: item.key,
      href: item.href,
      audience: item.audience,
      parentKey: item.parentKey,
    })),
  )
  if (navigation.added.length > 0) {
    options.log(`Navigation: added ${navigation.added.join(', ')}.`)
  }
  if (navigation.removed.length > 0) {
    options.log(`Navigation: removed ${navigation.removed.join(', ')}.`)
  }

  await recordVersion(db, 'core', CODE_VERSION)
  options.log(`Recorded version ${CODE_VERSION}.`)
  return 0
}
