/**
 * F84 — `forum upgrade`.
 *
 * Core migrations, then each plugin's in dependency order, then the recorded
 * version. The order and the refusals come from `@forum/upgrade`, which is
 * tested without a database; this file is the part that reads the board, prints
 * the plan, and performs it.
 *
 * ## `--dry-run` is not a courtesy
 *
 * An upgrade command whose effect can only be learned by running it against a
 * production database is one operators run at 3am with their fingers crossed.
 * The plan is computed first either way, so printing it costs nothing and is the
 * difference between a rehearsed upgrade and a hopeful one.
 */

import {
  appliedPluginMigrations,
  applyPluginMigration,
  getDb,
  readVersion,
  recordVersion,
  runMigrations,
} from '@forum/db'
import type { PluginDefinition } from '@forum/plugin-kit'
import { planUpgrade, upgradeNotice, type PluginUpgrade } from '@forum/upgrade'

/** The version this code is. Bumped by the release, read by the board. */
export const CODE_VERSION = '0.1.0'

/**
 * The installed plugins, as the planner needs them.
 *
 * Taken as an argument rather than imported, because `forum.config.ts` lives in
 * the *board's* project rather than in this package — an operator CLI installed
 * from npm has no path to it. The web app passes its own; the CLI passes what it
 * can see, which today is nothing.
 */
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

  /*
   * A board with no recorded version is one installed before F84 existed, or by
   * a migration run rather than by `/install`. Treated as the code's own
   * version: the alternative is inventing a low one and "upgrading" a board that
   * is already current, which would re-run nothing but would record a lie.
   */
  const recordedVersion = (await readVersion(db, 'core')) ?? CODE_VERSION

  const applied: Record<string, readonly string[]> = {}
  for (const plugin of plugins) {
    applied[plugin.key] = await appliedPluginMigrations(db, plugin.key)
  }

  const state = {
    recordedVersion,
    codeVersion: CODE_VERSION,
    /*
     * Not enumerated. Drizzle's runner reports how many it applied and does not
     * offer a list beforehand without reading the journal twice; the plan says
     * "core migrations" and the run says how many there were, which is what an
     * operator needs and is honest about what is known when.
     */
    pendingCoreMigrations: [] as readonly string[],
    plugins,
    appliedPluginMigrations: applied,
  }

  const plan = planUpgrade(state)

  if (plan.refusal !== null || plan.orderFailure !== null) {
    options.log(upgradeNotice(plan, state) ?? 'This board cannot be upgraded.')
    return 1
  }

  /*
   * Core migrations run whether or not the version moved: a release can add one
   * without changing the version people see, and the planner cannot enumerate
   * them (see above), so "nothing pending" here would be a guess.
   */
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

  /* Last. A version recorded before the work is a board claiming to be something it is not. */
  await recordVersion(db, 'core', CODE_VERSION)
  options.log(`Recorded version ${CODE_VERSION}.`)
  return 0
}
