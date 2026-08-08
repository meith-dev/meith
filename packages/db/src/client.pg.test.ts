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

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isScope } from '@meith/api'

import { PostgresApiTokenRepository } from './api-repo'
import { createIsolatedDb } from './client'
import { resultRows } from './result-rows'

/**
 * Every migration, in journal order — the same read `pglite.fixture.ts` does,
 * and for the same reason: the journal is what the real runner applies, so a
 * migration that is checked in and never registered fails here too.
 */
function migrationSql(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dir = path.resolve(here, '..', 'migrations')
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string }[] }

  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(path.join(dir, `${entry.tag}.sql`), 'utf8'))
    .join('\n')
    .replaceAll('--> statement-breakpoint', '')
}

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

  /*
   * The **reading** direction, which this file only covered by accident.
   *
   * `restoreDateSerialisers` repairs writing. Reading needs no repair — but it
   * does need *saying*, because the two drivers differ and the difference is
   * invisible until a caller assumes one of them. The 7 August 2026 audit found
   * `PostgresApiTokenRepository.listAll` asserting `created_at: Date` on a raw
   * execute and handing the value to `formatTime`, which calls `.toISOString()`.
   * On PGlite that is a Date and it worked; on a real server it is a string, so
   * `/admin/api-tokens` threw and 500'd for good the moment any token had been
   * used — with the revoke button on it.
   *
   * The repository is driven here rather than the driver, because "a raw execute
   * returns strings" is a fact about drizzle that may change and does not matter
   * on its own. What matters, and what this pins, is that the repository hands
   * its caller a real `Date` **on the driver production uses**.
   */
  describe('timestamps a repository returns from a raw execute', () => {
    let repo: PostgresApiTokenRepository

    beforeAll(async () => {
      await harness.db.execute(sql.raw(migrationSql()))
      repo = new PostgresApiTokenRepository(harness.db, isScope)

      await harness.db.execute(sql`
        insert into users (id, username, username_lower, email, email_lower,
                           password_hash, password_algo, primary_group_id)
        values (1, 'owner', 'owner', 'o@example.test', 'o@example.test', 'x', 'argon2id', 2)
      `)
      await harness.db.execute(sql`
        insert into api_tokens (user_id, name, lookup, secret_hash, scopes,
                                created_at, expires_at, last_used_at)
        values (1, 'ci', 'abcd1234', 'x', '["communities:read"]'::jsonb,
                now(), now() + interval '1 day', now())
      `)
    })

    it('are Date objects, so a view can format them', async () => {
      const [token] = await repo.listAll()

      expect(token).toBeDefined()
      expect(token!.createdAt).toBeInstanceOf(Date)
      expect(token!.expiresAt).toBeInstanceOf(Date)
      expect(token!.lastUsedAt).toBeInstanceOf(Date)
      /* The exact call the ACP page makes, and the exact one that used to throw. */
      expect(() => token!.lastUsedAt!.toISOString()).not.toThrow()
    })

    it('keep null as null rather than an Invalid Date', async () => {
      const [token] = await repo.listAll()

      expect(token!.revokedAt).toBeNull()
    })
  })
})
