/**
 * F70's read side, against real Postgres.
 *
 * `tasks` and `task_log` have been written since F06 and read by nothing an
 * operator could see. What is proven here is that this reads them faithfully —
 * particularly the fields the health verdict depends on, since a wrong
 * `last_run_at` or a dropped failure count turns a loud warning into a quiet
 * lie.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresSystemHealthRepository } from './system-health-repo'

let harness: TestDb
let db: Database
let repo: PostgresSystemHealthRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresSystemHealthRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from task_log`)
  await db.execute(sql`delete from tasks`)
  await db.execute(sql`delete from jobs`)
})

describe('taskHealth', () => {
  it('reads every field the verdict depends on', async () => {
    /*
     * The status is computed elsewhere from exactly these fields, so a dropped
     * one is a wrong verdict rather than a missing column on a screen.
     */
    await db.execute(sql`
      insert into tasks (key, interval_seconds, enabled, last_run_at, next_run_at,
                         consecutive_failures)
      values ('expire-bans', 300, true, now() - interval '1 hour',
              now() + interval '5 minutes', 2)
    `)

    const tasks = await repo.taskHealth()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      key: 'expire-bans',
      intervalSeconds: 300,
      enabled: true,
      consecutiveFailures: 2,
    })
    expect(tasks[0]?.lastRunAt).toBeInstanceOf(Date)
  })

  it('keeps a never-run task’s null rather than inventing a date', async () => {
    /*
     * `never-run` and `stale` are different verdicts — "it has not started" is
     * not "it stopped" — and coercing the null to an epoch date would report a
     * fresh board as catastrophically overdue.
     */
    await db.execute(sql`
      insert into tasks (key, interval_seconds, next_run_at) values ('fresh', 300, now())
    `)

    expect((await repo.taskHealth())[0]?.lastRunAt).toBeNull()
  })

  it('is empty on a board with no registered tasks', async () => {
    expect(await repo.taskHealth()).toEqual([])
  })
})

describe('recentRuns', () => {
  it('returns the newest first, failures included', async () => {
    /*
     * The log is where an operator looks after the summary says something is
     * wrong, so filtering failures out would remove the only text on the screen
     * that says why.
     */
    await db.execute(sql`
      insert into task_log (task_key, succeeded, duration_ms, detail, error, ran_at)
      values ('a', true, 12, 'moved=3', null, now() - interval '2 minutes'),
             ('b', false, 40, null, 'connection refused', now())
    `)

    const runs = await repo.recentRuns(10)
    expect(runs.map((run) => run.taskKey)).toEqual(['b', 'a'])
    expect(runs[0]).toMatchObject({ succeeded: false, error: 'connection refused' })
    expect(runs[1]).toMatchObject({ succeeded: true, detail: 'moved=3' })
  })

  it('honours the limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await db.execute(sql`
        insert into task_log (task_key, succeeded) values (${`t${i}`}, true)
      `)
    }
    expect(await repo.recentRuns(2)).toHaveLength(2)
  })
})

describe('volumes', () => {
  it('separates jobs still waiting from dead-lettered ones', async () => {
    /*
     * The two mean opposite things: a queue with work in it is a queue doing
     * its job, and a dead-lettered job is work that has given up. Kills the
     * mutant that counts them together.
     */
    await db.execute(sql`
      insert into jobs (kind, status) values
        ('a', 'pending'), ('b', 'running'), ('c', 'dead'), ('d', 'done')
    `)

    const volumes = await repo.volumes()
    expect(volumes.queuedJobs).toBe(2)
    expect(volumes.deadLetteredJobs).toBe(1)
  })

  it('counts a board with nothing on it as zero rather than failing', async () => {
    const volumes = await repo.volumes()
    expect(volumes).toMatchObject({ threads: 0, posts: 0, queuedJobs: 0 })
  })
})

describe('recountState', () => {
  it('reports the resume point', async () => {
    await db.execute(sql`
      insert into counter_recount_state (id, phase, cursor, passes, corrected)
      values ('scheduled', 'threads', 4200, 1, 17)
      on conflict (id) do update set phase = excluded.phase, cursor = excluded.cursor,
        passes = excluded.passes, corrected = excluded.corrected
    `)

    const state = await repo.recountState()
    expect(state.find((row) => row.id === 'scheduled')).toMatchObject({
      phase: 'threads',
      cursor: 4200,
      corrected: 17,
    })
  })
})
