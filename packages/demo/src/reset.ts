import { GLOBAL_TAGS, env, logger, type CacheDriver } from '@meith/core'
import { runMigrations, type Database } from '@meith/db'
import type { PluginDefinition } from '@meith/plugin-kit'
import { sql } from 'drizzle-orm'

import { seedDemoBoard, type SeedSummary } from './seed'

export interface ResetDeps {
  readonly db: Database
  /**
   * Cleared after the seed. Optional because the CLI has no cache to clear, and
   * a missing one is not an error there.
   */
  readonly cache?: CacheDriver | undefined
  /** Wipes uploaded files. Optional for the same reason. */
  readonly clearUploads?: (() => Promise<void>) | undefined
  readonly now?: Date | undefined
  /** Injectable so the recovery path below can be tested without a broken database. */
  readonly migrate?: (() => Promise<number>) | undefined
  readonly plugins?: readonly PluginDefinition[] | undefined
}

export interface ResetResult extends SeedSummary {
  readonly migrationsApplied: number
  readonly elapsedMs: number
}

/**
 * Throws the demo board away and builds a new one.
 *
 * The schema is dropped rather than truncated, and that is the whole design.
 * Truncating leaves behind everything the migrations seeded — the usergroup
 * ladder, the warning types, the permission defaults — and a demo visitor holds
 * the administrator password, so those are exactly the rows they can wreck. A
 * reset that cannot restore the guest group's permissions is a reset that
 * cannot fix the one thing most likely to need fixing.
 *
 * The board is unreachable while this runs — a few seconds — because the tables
 * genuinely are not there. On a board that announces its own reset in a banner,
 * that is honest rather than embarrassing.
 */
export async function resetDemoBoard(deps: ResetDeps): Promise<ResetResult> {
  if (!env.DEMO_MODE) {
    throw new Error(
      'Refusing to reset: DEMO_MODE is not set. This drops every table in the ' +
        'database, and on a board with real members that is not a reset, it is ' +
        'the end of the board.',
    )
  }

  const log = logger({ module: 'demo' })
  const startedAt = Date.now()
  const migrate = deps.migrate ?? runMigrations

  log.warn('demo reset: dropping the board')

  await deps.db.execute(sql`drop schema if exists drizzle cascade`)
  await deps.db.execute(sql`drop schema if exists public cascade`)
  await deps.db.execute(sql`create schema public`)

  let migrationsApplied: number
  let summary: SeedSummary
  try {
    migrationsApplied = await migrate()
    summary = await seedDemoBoard(deps.db, deps.now ?? new Date(), { plugins: deps.plugins })
  } catch (error) {
    await recoverSchema(deps, migrate)
    throw error
  }

  if (deps.clearUploads !== undefined) {
    try {
      await deps.clearUploads()
    } catch (error) {
      log.warn({ err: String(error) }, 'demo reset could not clear the uploads directory')
    }
  }

  if (deps.cache !== undefined) {
    await deps.cache.invalidateTags(GLOBAL_TAGS)
  }

  const result: ResetResult = {
    ...summary,
    migrationsApplied,
    elapsedMs: Date.now() - startedAt,
  }

  log.warn(result, 'demo reset: board rebuilt')
  return result
}

/**
 * Puts the schema back after a reset that died between the drop and the seed.
 *
 * Without this the board is not merely broken, it is **unrecoverable without a
 * human**: the reset runs from the scheduler, the scheduler's own `tasks` table
 * was in the schema that was just dropped, and every later tick fails trying to
 * register against a table that is not there. Nothing ever tries the reset
 * again.
 *
 * So the failure path re-runs the migrations and nothing else. That leaves an
 * empty board rather than a seeded one, which is a bad demo for up to one reset
 * interval — and a board that fixes itself on the next tick instead of one that
 * waits for somebody to notice.
 */
async function recoverSchema(
  deps: ResetDeps,
  migrate: () => Promise<number>,
): Promise<void> {
  const log = logger({ module: 'demo' })

  try {
    await deps.db.execute(sql`create schema if not exists public`)
    await migrate()
    log.warn('demo reset failed, but the schema is back: the next tick will try again')
  } catch (error) {
    log.error(
      { err: String(error) },
      'demo reset failed and the schema could not be rebuilt — this board needs ' +
        '`community demo:reset --yes` run against it by hand',
    )
  }
}
