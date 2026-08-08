/**
 * `pnpm --filter @meith/db migrate` — apply every pending migration from a
 * checkout.
 *
 * CI's migrations job has invoked this script name for its whole life, and
 * until this file existed the invocation printed "None of the selected
 * packages has a 'migrate' script" and moved on — so the job's first step
 * applied nothing, and the drift check below it ran against an empty database
 * that nothing had ever asked to be current.
 *
 * The image's migrate role is `apps/worker/src/migrate.ts`; this is the
 * checkout-shaped twin. Both call the same `runMigrations()` the operator
 * CLI's `community migrate` runs, so a board migrated from CI, from the image
 * and by an operator have all been through identical code.
 */
import { logger } from '@meith/core'
import { loadEnvFiles } from '@meith/core/env-files'

import { runMigrations } from './migrate'

/* Bound where it is used, not at module scope (guard F02). */
const log = () => logger({ module: 'migrate' })

/* Ahead of the first `process.env` read, so a checkout's `.env` is seen. */
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
