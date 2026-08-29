import { getDb, pluginOwnedTables, purgePlugin } from '@meith/db'
import type { PluginDefinition } from '@meith/plugin-kit'
import { runPluginLifecycle } from '@meith/runtime'

export interface PurgeOptions {
  readonly key: string
  readonly plugins: readonly PluginDefinition[]
  readonly confirmed: boolean
  readonly log: (line: string) => void
}

export async function purge(options: PurgeOptions): Promise<number> {
  const definition = options.plugins.find((plugin) => plugin.key === options.key)

  if (definition === undefined) {
    options.log(`No plugin named "${options.key}" is in this build.`)
    options.log('')
    options.log('Purging runs the plugin’s own onUninstall before dropping its data, so it')
    options.log('has to happen while the code is still installed. Put the plugin back into')
    options.log('meith.plugins.ts, deploy, purge, and then remove it.')
    return 1
  }

  const db = getDb()
  const tables = await pluginOwnedTables(db, options.key)

  if (!options.confirmed) {
    options.log(`Would purge "${options.key}":`)
    options.log(
      definition.onUninstall === undefined
        ? '  - it declares no onUninstall'
        : '  - run its onUninstall',
    )
    options.log(tables.length === 0 ? '  - no tables of its own' : `  - drop ${tables.join(', ')}`)
    options.log('  - delete its settings, migration records, navigation items and health row')
    options.log('')
    options.log('This cannot be undone. Run again with --yes to do it.')
    return 0
  }

  const { ran } = await runPluginLifecycle({ db, plugin: definition, phase: 'uninstall' })
  if (ran) options.log(`${options.key}: onUninstall.`)

  const result = await purgePlugin(db, options.key)

  options.log(
    result.tables.length === 0
      ? `Purged "${options.key}": it had no tables of its own.`
      : `Purged "${options.key}": dropped ${result.tables.join(', ')}.`,
  )
  options.log(
    `Removed ${result.settings} setting(s), ${result.migrations} migration record(s), ` +
      `${result.navigation} navigation item(s).`,
  )
  options.log('')
  options.log('Now take it out of meith.plugins.ts, pnpm remove it, and redeploy.')

  return 0
}
