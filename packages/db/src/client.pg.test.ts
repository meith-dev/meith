import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isScope } from '@meith/api'

import { PostgresApiTokenRepository } from './api-repo'
import { createIsolatedDb } from './client'
import { resultRows } from './result-rows'

function migrationSql(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dir = path.resolve(here, '..', 'migrations')
  const journal = JSON.parse(readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[]
  }

  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(path.join(dir, `${entry.tag}.sql`), 'utf8'))
    .join('\n')
    .replaceAll('--> statement-breakpoint', '')
}

const URL = process.env.TEST_DATABASE_URL
const describeIfPg = URL ? describe : describe.skip

const SCRATCH = `meith_pg_test_${process.pid}`

function scratchUrl(adminUrl: string): string {
  const url = new globalThis.URL(adminUrl)
  url.pathname = `/${SCRATCH}`
  return url.toString()
}

describeIfPg('against real Postgres', () => {
  let admin: ReturnType<typeof createIsolatedDb>
  let harness: ReturnType<typeof createIsolatedDb>

  beforeAll(async () => {
    admin = createIsolatedDb(URL!)
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`))
    await admin.db.execute(sql.raw(`CREATE DATABASE "${SCRATCH}"`))
    harness = createIsolatedDb(scratchUrl(URL!))
  })

  afterAll(async () => {
    await harness.close()
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`))
    await admin.close()
  })

  describe('Date parameters in raw sql templates', () => {
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

  describe('what the API-token repository returns from a raw execute', () => {
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
        values (1, 'ci', 'abcd1234', 'x', '["forums:read"]'::jsonb,
                now(), now() + interval '1 day', now())
      `)
    })

    it('are Date objects, so a view can format them', async () => {
      const [token] = await repo.listAll()

      expect(token).toBeDefined()
      expect(token!.createdAt).toBeInstanceOf(Date)
      expect(token!.expiresAt).toBeInstanceOf(Date)
      expect(token!.lastUsedAt).toBeInstanceOf(Date)
      expect(() => token!.lastUsedAt!.toISOString()).not.toThrow()
    })

    it('keep null as null rather than an Invalid Date', async () => {
      const [token] = await repo.listAll()

      expect(token!.revokedAt).toBeNull()
    })

    it('drops a scope the board no longer declares instead of refusing the token', async () => {
      await harness.db.execute(sql`
        insert into api_tokens (user_id, name, lookup, secret_hash, scopes, created_at)
        values (1, 'issued before a scope was retired', 'deadbeef', 'x',
                '["forums:read", "threads:write", "admin:read"]'::jsonb,
                now() - interval '1 hour')
      `)

      const token = await repo.findByLookup('deadbeef')

      expect(token).not.toBeNull()
      expect(token!.scopes).toEqual(['forums:read'])

      const listed = (await repo.listAll()).find((row) => row.lookup === 'deadbeef')
      expect(listed!.scopes).toEqual(['forums:read'])
    })
  })
})
