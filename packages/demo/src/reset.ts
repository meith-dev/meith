import { sql } from 'drizzle-orm'

import { type CacheDriver, env, GLOBAL_TAGS, logger } from '@meith/core'
import { type Database, runMigrations } from '@meith/db'
import type { PluginDefinition } from '@meith/plugin-kit'

import { type SeedSummary, seedDemoBoard } from './seed'

export interface ResetDeps {
  readonly db: Database
  readonly cache?: CacheDriver | undefined
  readonly clearUploads?: (() => Promise<void>) | undefined
  readonly now?: Date | undefined
  readonly migrate?: (() => Promise<number>) | undefined
  readonly plugins?: readonly PluginDefinition[] | undefined
}

export interface ResetResult extends SeedSummary {
  readonly migrationsApplied: number
  readonly elapsedMs: number
}

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

async function recoverSchema(deps: ResetDeps, migrate: () => Promise<number>): Promise<void> {
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
