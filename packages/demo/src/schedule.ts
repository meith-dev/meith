import { sql } from 'drizzle-orm'

import { env } from '@meith/core'
import { type Database, resultRows } from '@meith/db'
import type { TaskDefinition } from '@meith/tasks'

import { type ResetDeps, resetDemoBoard } from './reset'

export const DEMO_RESET_TASK_ID = 'demo.reset'

/**
 * Generous, because the run drops the schema, replays 35 migrations and writes
 * the board back. Ten seconds on a warm machine; the budget is here to catch a
 * reset that has genuinely hung, not to race a slow disk.
 */
const RESET_BUDGET_SECONDS = 300

export function demoResetTask(deps: Omit<ResetDeps, 'now'>): TaskDefinition {
  return {
    id: DEMO_RESET_TASK_ID,
    title: 'Reset the demo board',
    description:
      'Drops every table, replays the migrations and writes the demo board back. ' +
      'Registered only when DEMO_MODE is set, because on any other board this ' +
      'task is a data-loss incident on a timer.',
    intervalSeconds: env.DEMO_RESET_MINUTES * 60,
    maxDurationSeconds: RESET_BUDGET_SECONDS,
    async run({ now }) {
      const result = await resetDemoBoard({ ...deps, now })

      await stampLastRun(deps.db, now)

      return {
        detail: {
          members: result.members,
          forums: result.forums,
          threads: result.threads,
          posts: result.posts,
          elapsedMs: result.elapsedMs,
        },
      }
    },
  }
}

async function stampLastRun(db: Database, at: Date): Promise<void> {
  const intervalSeconds = env.DEMO_RESET_MINUTES * 60

  await db.execute(sql`
    insert into tasks (key, interval_seconds, last_run_at, next_run_at)
    values (${DEMO_RESET_TASK_ID}, ${intervalSeconds}, ${at},
            ${at}::timestamptz + make_interval(secs => ${intervalSeconds}))
    on conflict (key) do update
       set last_run_at = excluded.last_run_at,
           next_run_at = excluded.next_run_at
  `)
}

/**
 * When the board next throws itself away, or `null` if it has not run once yet.
 *
 * Read from the column the scheduler itself selects on rather than computed
 * from a wall-clock boundary, so the banner cannot promise a reset at a time
 * the scheduler has no intention of resetting at.
 */
export async function nextDemoResetAt(db: Database): Promise<Date | null> {
  const rows = resultRows(
    await db.execute(sql`
      select last_run_at, next_run_at from tasks where key = ${DEMO_RESET_TASK_ID}
    `),
  ) as Array<{ last_run_at: Date | string | null; next_run_at: Date | string | null }>

  const row = rows[0]
  if (row === undefined || row.last_run_at === null) return null

  const next = row.next_run_at
  if (next === null || next === undefined) return null

  return next instanceof Date ? next : new Date(next)
}
