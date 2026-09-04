import { logger } from '@meith/core'
import { runMigrations } from '@meith/db'
import { backupBeforeMigrating } from '@meith/runtime'

const log = () => logger({ module: 'migrate' })

export async function migrate(migrationsDir: string): Promise<number> {
  try {
    await backupBeforeMigrating()
  } catch (err) {
    log().error(
      { err },
      'the backup the settings ask for before a migration failed; refusing to migrate without it',
    )
    return 1
  }

  try {
    const applied = await runMigrations({ folder: migrationsDir })
    log().info({ applied }, applied === 0 ? 'already up to date' : 'migrations applied')
    return 0
  } catch (err) {
    log().error({ err }, 'migration failed')
    return 1
  }
}
