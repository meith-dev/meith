/**
 * F04 — applying migrations from inside the standalone image.
 *
 * `docker-compose.yml` ran `node node_modules/.bin/drizzle-kit migrate` for its
 * one-shot `migrate` service, and that has never worked: the runtime stage
 * carries `.next/standalone`, whose `node_modules` is the pruned set Next
 * traced as reachable from the server. drizzle-kit is a development tool and is
 * not in it. Nothing noticed because no CI job ever booted the image — which is
 * the gap F04's `image` job now closes, and this is one of the three things it
 * found.
 *
 * So the migrator is bundled the same way the worker is, and reached the same
 * way: `FORUM_ROLE=migrate`. One image, three roles, one build — which is the
 * property F04 actually asks for.
 *
 * It runs the *same* `runMigrations()` the operator CLI's `forum migrate` runs,
 * rather than shelling out to drizzle-kit, so a board migrated by the image and
 * a board migrated by an operator have been through identical code.
 */
import { logger } from '@forum/core'
import { runMigrations } from '@forum/db'

/**
 * Bound where it is used, not at module scope (guard F02).
 *
 * A module-level instance builds pino eagerly, which reads `env.LOG_LEVEL` and
 * turns merely importing this file into an environment validation. That is
 * exactly the failure mode the worker must not have: the bundle is imported by
 * nothing else, but the rule is the rule, and it costs a function call.
 */
const log = () => logger({ module: 'migrate' })

/**
 * Where the image puts the generated SQL.
 *
 * Passed explicitly rather than resolved relative to this module: this file is
 * an esbuild CJS bundle, where `import.meta.url` is undefined, and the pruned
 * standalone `node_modules` does not contain `@forum/db`'s source tree anyway.
 * The SQL is *data*, so Next never traced it and the Dockerfile copies it.
 */
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
