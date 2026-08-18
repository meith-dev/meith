import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createIsolatedDb } from './client'
import { isInstalled, markInstalled, withInstallLock } from './install-repo'

const URL = process.env.TEST_DATABASE_URL
const describeIfPg = URL ? describe : describe.skip

const SCRATCH = `meith_install_lock_${process.pid}`

function scratchUrl(adminUrl: string): string {
  const url = new globalThis.URL(adminUrl)
  url.pathname = `/${SCRATCH}`
  return url.toString()
}

describeIfPg('the install lock, against real Postgres', () => {
  let admin: ReturnType<typeof createIsolatedDb>
  let harness: ReturnType<typeof createIsolatedDb>
  let url: string

  beforeAll(async () => {
    admin = createIsolatedDb(URL!)
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`))
    await admin.db.execute(sql.raw(`CREATE DATABASE "${SCRATCH}"`))

    url = scratchUrl(URL!)
    harness = createIsolatedDb(url)
    await harness.db.execute(sql`
      create table install_state (
        id smallint primary key default 1 not null,
        completed_at timestamptz default now() not null,
        installed_version text not null,
        constraint install_state_single_row check (id = 1)
      )
    `)
  })

  afterEach(async () => {
    await harness.db.execute(sql`delete from install_state`)
  })

  afterAll(async () => {
    await harness.close()
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`))
    await admin.close()
  })

  it('runs the body and hands back what it returned', async () => {
    expect(await withInstallLock(url, async () => 'ran')).toBe('ran')
  })

  it('refuses a second holder while the first still has it', async () => {
    let second: string | null = 'not attempted'

    await withInstallLock(url, async () => {
      second = await withInstallLock(url, async () => 'ran')
    })

    expect(second).toBeNull()
  })

  it('hands the lock on once the first holder is finished', async () => {
    await withInstallLock(url, async () => undefined)

    expect(await withInstallLock(url, async () => 'ran')).toBe('ran')
  })

  it('releases the lock even when the body throws', async () => {
    await expect(
      withInstallLock(url, async () => {
        throw new Error('the install failed')
      }),
    ).rejects.toThrow('the install failed')

    expect(await withInstallLock(url, async () => 'ran')).toBe('ran')
  })

  it('seals the board for whichever install got there first, and only that one', async () => {
    expect(await markInstalled(harness.db, '0.1.0')).toBe(true)
    expect(await markInstalled(harness.db, '0.1.0')).toBe(false)
    expect(await isInstalled(harness.db)).toBe(true)
  })

  it('lets only one of a crowd of concurrent installs through', async () => {
    const sealed: boolean[] = []

    await Promise.all(
      Array.from({ length: 8 }, async () => {
        const outcome = await withInstallLock(url, async () => {
          if (await isInstalled(harness.db)) return false
          return markInstalled(harness.db, '0.1.0')
        })

        if (outcome !== null) sealed.push(outcome)
      }),
    )

    expect(sealed.filter(Boolean)).toHaveLength(1)
    expect(await isInstalled(harness.db)).toBe(true)
  })
})
