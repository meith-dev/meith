import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MIGRATION_LOCK_KEY, runMigrations } from './migrate'

const ADMIN_URL = process.env.TEST_DATABASE_URL
const describeIfPg = ADMIN_URL ? describe : describe.skip

const created: string[] = []

let admin: ReturnType<typeof postgres>

function urlFor(database: string): string {
  const url = new URL(ADMIN_URL!)
  url.pathname = `/${database}`
  return url.toString()
}

async function scratchDatabase(suffix: string): Promise<string> {
  const name = `meith_migrate_${process.pid}_${suffix}`
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.unsafe(`CREATE DATABASE "${name}"`)
  created.push(name)
  return urlFor(name)
}

function settled<T>(promise: Promise<T>): { done: () => boolean; value: Promise<T> } {
  let done = false
  const value = promise.then(
    (result) => {
      done = true
      return result
    },
    (error: unknown) => {
      done = true
      throw error
    },
  )
  return { done: () => done, value }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describeIfPg('two migrate containers starting together', () => {
  beforeAll(() => {
    admin = postgres(ADMIN_URL!, { max: 1, prepare: false, onnotice: () => {} })
  }, 60_000)

  afterAll(async () => {
    for (const name of created) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    }
    await admin.end({ timeout: 5 })
  })

  it('serialise: the second waits for the first rather than racing it', async () => {
    const url = await scratchDatabase('concurrent')

    const [first, second] = await Promise.all([runMigrations({ url }), runMigrations({ url })])

    expect([first, second].filter((applied) => applied > 0)).toHaveLength(1)
    expect([first, second].filter((applied) => applied === 0)).toHaveLength(1)
  }, 120_000)

  it('waits on the documented key, so a lock held elsewhere blocks the run', async () => {
    const url = await scratchDatabase('blocked')
    const holder = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

    try {
      await holder`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`

      const run = settled(runMigrations({ url }))
      await wait(500)
      expect(run.done()).toBe(false)

      await holder`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`

      expect(await run.value).toBeGreaterThan(0)
    } finally {
      await holder.end({ timeout: 5 })
    }
  }, 120_000)

  it('releases the lock when it finishes, so the next deploy is not blocked', async () => {
    const url = await scratchDatabase('released')
    await runMigrations({ url })

    const observer = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
    try {
      const [row] = await observer<{ held: boolean }[]>`
        select pg_try_advisory_lock(${MIGRATION_LOCK_KEY}::bigint) as held
      `
      expect(row?.held).toBe(true)
    } finally {
      await observer.end({ timeout: 5 })
    }
  }, 120_000)
})
