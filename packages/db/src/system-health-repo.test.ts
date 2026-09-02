import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { MYBB_PREFIX, PHPBB_PREFIX } from '@meith/accounts'

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
  await db.execute(sql`delete from users`)
})

describe('taskHealth', () => {
  it('reads every field the verdict depends on', async () => {
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

describe('legacyPasswordHashes', () => {
  it('counts only members still on an imported hash', async () => {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (1, 'ada', 'ada', 'a@example.test', 'a@example.test',
              ${`${MYBB_PREFIX}salt$${'0'.repeat(32)}`}, 'legacy', 2),
             (2, 'bea', 'bea', 'b@example.test', 'b@example.test',
              ${`${PHPBB_PREFIX}$2y$10$${'a'.repeat(53)}`}, 'legacy', 2),
             (3, 'cy', 'cy', 'c@example.test', 'c@example.test', 'x', 'argon2id', 2),
             (4, 'deleted', 'deleted', 'd@example.test', 'd@example.test',
              ${`${MYBB_PREFIX}salt$${'0'.repeat(32)}`}, 'legacy', 2)
    `)
    await db.execute(sql`update users set deleted_at = now() where id = 4`)

    expect(await repo.legacyPasswordHashes()).toBe(2)
  })

  it('is zero once every member has upgraded', async () => {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (1, 'ada', 'ada', 'a@example.test', 'a@example.test', 'x', 'argon2id', 2)
    `)

    expect(await repo.legacyPasswordHashes()).toBe(0)
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
