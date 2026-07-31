/**
 * The tests that need a *real* Postgres server, not PGlite.
 *
 * Every other database suite here runs against PGlite, which is the right
 * trade — it is fast, it needs no service, and it runs the actual generated
 * SQL. But it is not the same *driver*, and F11's row has always said so. This
 * file is for the cases where that difference is the whole point.
 *
 * It found its first one immediately: `drizzle(client)` replaces postgres.js's
 * date serialisers with a passthrough, so a `Date` interpolated into a raw
 * `sql` template reached `Buffer.byteLength()` and threw. PGlite does not go
 * through those serialisers, so 1800-odd tests passed while the write path was
 * broken against every real server. See `restoreDateSerialisers` in client.ts.
 *
 * **Skipped unless `TEST_DATABASE_URL` is set**, so a normal `pnpm test` needs
 * no service. CI's `migrations` job already runs a Postgres and sets it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { createIsolatedDb } from './client'
import { resultRows } from './result-rows'

const URL = process.env.TEST_DATABASE_URL
const describeIfPg = URL ? describe : describe.skip

describeIfPg('against real Postgres', () => {
  let harness: ReturnType<typeof createIsolatedDb>

  beforeAll(() => {
    harness = createIsolatedDb(URL!)
  })

  afterAll(async () => {
    await harness.close()
  })

  describe('Date parameters in raw sql templates', () => {
    /*
     * The regression. A `Date` in a raw template is how most of this package
     * writes timestamps — `updated_at = ${at}`, `locked_until = ${lockedUntil}`
     * — and it threw on every real server until the serialiser was restored.
     */
    it('accepts a Date and round-trips it', async () => {
      const at = new Date('2026-07-31T12:34:56.000Z')
      const rows = resultRows(
        await harness.db.execute(sql`select ${at}::timestamptz as at`),
      ) as Array<{ at: Date | string }>

      expect(new Date(rows[0]!.at).toISOString()).toBe(at.toISOString())
    })

    it('accepts a Date in a comparison, which is what the scheduler does', async () => {
      const rows = resultRows(
        await harness.db.execute(
          sql`select (${new Date('2020-01-01T00:00:00Z')}::timestamptz < now()) as past`,
        ),
      ) as Array<{ past: boolean }>

      expect(rows[0]!.past).toBe(true)
    })

    it('still passes a string straight through, as drizzle intends', async () => {
      const rows = resultRows(
        await harness.db.execute(sql`select ${'2026-07-31T12:34:56Z'}::timestamptz as at`),
      ) as Array<{ at: Date | string }>

      expect(new Date(rows[0]!.at).toISOString()).toBe('2026-07-31T12:34:56.000Z')
    })

    it('leaves null alone', async () => {
      const rows = resultRows(
        await harness.db.execute(sql`select ${null}::timestamptz as at`),
      ) as Array<{ at: null }>

      expect(rows[0]!.at).toBeNull()
    })
  })

  /*
   * The specific query that broke: `PostgresTaskRepository.claim` passes three
   * Dates. It is exercised here through the driver rather than the repository
   * because the repository's own behaviour is covered on PGlite — what this
   * pins is that the *driver* accepts the shape.
   */
  it('runs the scheduler claim shape', async () => {
    const now = new Date()
    const rows = resultRows(
      await harness.db.execute(sql`
        select ${now}::timestamptz as now,
               ${new Date(now.getTime() - 900_000)}::timestamptz as due_before,
               ${new Date(now.getTime() + 900_000)}::timestamptz as locked_until
      `),
    ) as Array<Record<string, unknown>>

    expect(Object.keys(rows[0]!)).toEqual(['now', 'due_before', 'locked_until'])
  })
})
