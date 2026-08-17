import { resetEnvForTests } from '@meith/core'
import { PostgresForumRepository, resultRows, type Database } from '@meith/db'
import { createTestDb, migrationScript, type TestDb } from '@meith/db/pglite.fixture'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { resetDemoBoard } from './reset'
import { seedDemoBoard } from './seed'

let harness: TestDb
let db: Database

const NOW = new Date('2026-08-10T09:00:00Z')

/**
 * The migrations, applied the way the fixture applies them.
 *
 * `runMigrations()` opens its own connection to `DATABASE_URL` with the
 * postgres.js driver, which PGlite is not. Injecting the same SQL keeps the
 * sequence under test — drop, migrate, seed, against a real engine — and only
 * swaps out how the file gets to the server.
 */
async function applyMigrations(): Promise<number> {
  const results = await harness.client.exec(migrationScript())
  return results.length
}

async function count(table: string): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select count(*)::int as n from ${sql.raw(table)}`),
  ) as Array<{ n: number }>
  return rows[0]?.n ?? 0
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  await seedDemoBoard(db, NOW)
}, 120_000)

afterAll(async () => {
  await harness.close()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
})

function inDemoMode(): void {
  vi.stubEnv('DEMO_MODE', '1')
  vi.stubEnv('DATA_SOURCE', 'postgres')
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/demo')
  resetEnvForTests()
}

describe('a reset against a real engine', () => {
  it('throws away what a visitor did and puts the seeded board back', async () => {
    inDemoMode()

    await db.execute(sql`update usergroups set can_view = false where key = 'guests'`)
    await new PostgresForumRepository(db).create({
      type: 'forum',
      title: 'Vandalised',
      slug: 'vandalised',
      parentId: null,
    })
    const before = await count('forums')

    const result = await resetDemoBoard({ db, now: NOW, migrate: applyMigrations })

    expect(result.threads).toBeGreaterThan(0)
    expect(await count('forums')).toBe(before - 1)

    const guests = resultRows(
      await db.execute(sql`select can_view from usergroups where key = 'guests'`),
    ) as Array<{ can_view: boolean }>

    expect(guests[0]?.can_view).toBe(true)
  }, 120_000)

  it('leaves a board a second reset can run against', async () => {
    inDemoMode()

    const first = await resetDemoBoard({ db, now: NOW, migrate: applyMigrations })
    const second = await resetDemoBoard({ db, now: NOW, migrate: applyMigrations })

    expect(second.posts).toBe(first.posts)
    expect(second.members).toBe(first.members)
  }, 120_000)
})
