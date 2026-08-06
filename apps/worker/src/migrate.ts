import { logger } from '@meith/core'
import { loadEnvFiles } from '@meith/core/env-files'
import { runMigrations } from '@meith/db'

const log = () => logger({ module: 'migrate' })

loadEnvFiles()

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? '/app/migrations'

runMigrations({ folder: MIGRATIONS_DIR })
  .then((applied) => {
    log().info({ applied }, applied === 0 ? 'already up to date' : 'migrations applied')
    process.exit(0)
  })
  .catch((err: unknown) => {
    log().error({ err }, 'migration failed')
    process.exit(1)
  })
