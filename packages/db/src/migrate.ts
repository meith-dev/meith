/**
 * F03 — migration runner.
 *
 * Separate from `client.ts` because it needs a *different* connection shape: the
 * app runs through a transaction-mode pooler with `prepare: false` and a tiny
 * pool, whereas migrations need a single direct session that can hold advisory
 * locks and run DDL in a transaction.
 */

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ConfigurationError, env, logger } from '@meith/core'

/** What makes a folder the migrations folder rather than a folder of `.sql`. */
const JOURNAL = path.join('meta', '_journal.json')

/** Where the image puts the generated SQL. See the Dockerfile. */
const IMAGE_MIGRATIONS = '/app/migrations'

/**
 * Everywhere this could be, in the order worth trying.
 *
 * A pure function of three facts, so the ordering is a unit test rather than
 * something discovered on a deployment. It has to be a *list* because the same
 * `runMigrations()` is called from four programs that disagree about where they
 * are standing:
 *
 *  - `forum migrate` and `forum upgrade`, from a checkout or from the image;
 *  - the worker's `FORUM_ROLE=migrate` bundle, which passes the folder itself;
 *  - **the installer**, which runs inside the Next standalone server.
 *
 * That last one is why this exists. `path.resolve(dirname(import.meta.url),
 * '..', 'migrations')` is correct wherever the source tree is present, and the
 * standalone server is precisely where it is not: `@meith/db` has been compiled
 * into a chunk under `.next/server`, so the module-relative guess lands on a
 * folder that has never existed and the operator is told "Can't find
 * meta/_journal.json file" by a page whose one job is explaining what is wrong.
 * The SQL is data, so Next does not trace it; the Dockerfile copies it to
 * `/app/migrations`, and nothing told the web server that.
 */
export function migrationFolderCandidates(input: {
  /** `MIGRATIONS_DIR`. When set it is the answer, and the only one tried. */
  readonly explicit?: string | undefined
  /** The directory of this module, when the runtime admits to having one. */
  readonly moduleDir?: string | undefined
  readonly cwd: string
}): readonly string[] {
  if (input.explicit !== undefined && input.explicit !== '') return [input.explicit]

  const candidates: string[] = []

  /* A checkout: the SQL is beside this module. Undefined in a CJS bundle. */
  if (input.moduleDir !== undefined && input.moduleDir !== '') {
    candidates.push(path.resolve(input.moduleDir, '..', 'migrations'))
  }

  candidates.push(IMAGE_MIGRATIONS)

  /*
   * Upwards from wherever the process was started, because that differs per
   * program: `next dev` runs in `apps/forum`, the CLI in the repository root,
   * and the standalone server in `/app`. Both shapes are tried at each level —
   * a workspace has `packages/db/migrations`, an image has `migrations`.
   */
  let dir = path.resolve(input.cwd)
  for (;;) {
    candidates.push(path.join(dir, 'migrations'))
    candidates.push(path.join(dir, 'packages', 'db', 'migrations'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return candidates
}

/** The directory of this module, or undefined where there is no such thing. */
function moduleDir(): string | undefined {
  try {
    /* `import.meta.url` is undefined in the CJS bundles esbuild produces. */
    return path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return undefined
  }
}

/**
 * The first candidate that actually holds migrations.
 *
 * Throws naming `MIGRATIONS_DIR` rather than letting drizzle report a missing
 * `meta/_journal.json`: one of those messages tells an operator what to do.
 */
function migrationsFolder(): string {
  const candidates = migrationFolderCandidates({
    explicit: env.MIGRATIONS_DIR,
    moduleDir: moduleDir(),
    cwd: process.cwd(),
  })

  const found = candidates.find((folder) => existsSync(path.join(folder, JOURNAL)))
  if (found !== undefined) return found

  throw new ConfigurationError(
    'Cannot find the migrations. Set MIGRATIONS_DIR to the folder holding ' +
      `meta/_journal.json — looked in ${candidates.slice(0, 4).join(', ')}.`,
  )
}

/**
 * Applies every pending migration, then closes its own connection.
 *
 * Uses `DIRECT_DATABASE_URL` when present. Running DDL through a transaction-mode
 * pooler is unreliable: the pooler may hand successive statements to different
 * backends, so an advisory lock taken by one statement is invisible to the next
 * and two concurrent deploys can interleave DDL.
 */
export async function runMigrations(options: {
  /**
   * Where the generated SQL lives, when it is not beside this module.
   *
   * Defaulted from `import.meta.url`, which is correct everywhere the source
   * tree is present — and undefined in a CJS bundle, which is what the
   * standalone image's migrate role is. Passing the folder explicitly is the
   * honest fix; inferring it from `__dirname` would work today and break the
   * moment the bundle moves.
   */
  readonly folder?: string
} = {}): Promise<number> {
  const url = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL

  if (!url) {
    throw new ConfigurationError(
      'Cannot migrate without DATABASE_URL (or DIRECT_DATABASE_URL).',
    )
  }

  /*
   * max: 1 is required, not an optimisation. drizzle's migrator takes a
   * session-level advisory lock so concurrent deploys serialise; that lock is
   * only meaningful if every statement runs on the same connection.
   */
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    const before = await appliedCount(sql)
    await migrate(drizzle(sql), { migrationsFolder: options.folder ?? migrationsFolder() })
    const after = await appliedCount(sql)

    const applied = after - before
    logger({ component: 'migrate' }).info({ applied }, 'migrations applied')
    return applied
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * Counts rows in drizzle's bookkeeping table, tolerating its absence on a
 * first-ever run (when the table itself has not been created).
 */
async function appliedCount(sql: ReturnType<typeof postgres>): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM information_schema.tables
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
  `

  if (rows[0]?.count === '0') return 0

  const applied = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations
  `
  return Number(applied[0]?.count ?? '0')
}
