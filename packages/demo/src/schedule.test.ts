import { resetEnvForTests } from '@meith/core'
import type { Database } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { tick } from '@meith/tasks'
import { PostgresTaskRepository } from '@meith/db'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_RESET_TASK_ID, demoResetTask, nextDemoResetAt } from './schedule'

let harness: TestDb
let db: Database

const NOW = new Date('2026-08-10T09:00:00Z')

function inDemoMode(minutes = '60'): void {
  vi.stubEnv('DEMO_MODE', '1')
  vi.stubEnv('DEMO_RESET_MINUTES', minutes)
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/demo')
  resetEnvForTests()
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from tasks`)
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

describe('nextDemoResetAt', () => {
  it('is unknown until the board has reset once', async () => {
    inDemoMode()
    await expect(nextDemoResetAt(db)).resolves.toBeNull()
  })

  it('is one interval after the last reset', async () => {
    inDemoMode('30')
    await db.execute(sql`
      insert into tasks (key, interval_seconds, last_run_at)
      values (${DEMO_RESET_TASK_ID}, 1800, ${NOW})
    `)

    await expect(nextDemoResetAt(db)).resolves.toEqual(new Date('2026-08-10T09:30:00Z'))
  })
})

describe('the reset task', () => {
  /**
   * The reset drops the table that records when the reset last ran, so without
   * the stamp it writes back, the task is due again on the very next tick. This
   * is the test that a demo does not spend its life resetting.
   */
  it('does not come due again on the tick straight after it ran', async () => {
    inDemoMode()

    let resets = 0
    const task = {
      ...demoResetTask({ db }),
      async run(context: Parameters<ReturnType<typeof demoResetTask>['run']>[0]) {
        resets += 1
        // Stands in for the real reset, which drops every table including this
        // one — the row the tick just claimed does not survive it.
        await db.execute(sql`delete from tasks`)
        await db.execute(sql`
          insert into tasks (key, interval_seconds, last_run_at)
          values (${DEMO_RESET_TASK_ID}, 3600, ${context.now})
        `)
        return { detail: {} }
      },
    }

    const repository = new PostgresTaskRepository(db)

    await tick({ repository, tasks: [task], now: NOW })
    expect(resets).toBe(1)

    await tick({ repository, tasks: [task], now: new Date(NOW.getTime() + 60_000) })
    expect(resets).toBe(1)

    await tick({ repository, tasks: [task], now: new Date(NOW.getTime() + 61 * 60_000) })
    expect(resets).toBe(2)
  })

  it('takes its interval from the environment', () => {
    inDemoMode('15')
    expect(demoResetTask({ db }).intervalSeconds).toBe(900)
  })
})
