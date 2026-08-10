import { logger } from '@meith/core'
import { loadEnvFiles } from '@meith/core/env-files'

import { runMigrations } from './migrate'

const log = () => logger({ module: 'migrate' })

loadEnvFiles()

runMigrations()
  .then((applied) => {
    log().info({ applied }, applied === 0 ? 'already up to date' : 'migrations applied')
    process.exit(0)
  })
  .catch((error: unknown) => {
    log().error({ err: error }, 'migration failed')
    process.exit(1)
  })
