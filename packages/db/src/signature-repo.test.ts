/**
 * F58 — signatures against real Postgres.
 *
 * Two claims only the database settles:
 *
 *  - **a locked signature cannot be written**, because the lock is in the
 *    UPDATE's `where` rather than in a check the caller performs — which is
 *    what closes the race where a moderator locks it while the member has the
 *    form open;
 *  - `readMany` answers a whole page in one query, which is why the postbit is
 *    not an N+1.
 */
import { BodyFormat } from '@meith/markdown'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresSignatureRepository } from './signature-repo'

let harness: TestDb
let db: Database
let repo: PostgresSignatureRepository

const ADA = 1
const BOB = 2

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresSignatureRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ADA}, 'ada', 'ada', 'a@example.test', 'a@example.test', 'x', 'argon2id', 2),
           (${BOB}, 'bob', 'bob', 'b@example.test', 'b@example.test', 'x', 'argon2id', 2)
  `)
})

function save(userId: number, signature: string) {
  return repo.save({
    userId,
    signature,
    signatureHtml: `<p>${signature}</p>`,
    renderVersion: 1,
  })
}

describe('reading and writing', () => {
  it('starts empty and unlocked', async () => {
    expect(await repo.read(ADA)).toEqual({
      signature: '',
      /* New rows are Markdown; the column's default says so. */
      signatureFormat: BodyFormat.Markdown,
      signatureHtml: null,
      signatureRenderVersion: 0,
      locked: false,
      lockedReason: null,
    })
  })

  it('stores the source, the render and its version', async () => {
    expect(await save(ADA, 'Hello')).toBe(true)

    expect(await repo.read(ADA)).toMatchObject({
      signature: 'Hello',
      signatureHtml: '<p>Hello</p>',
      signatureRenderVersion: 1,
    })
  })

  it('is scoped to one member', async () => {
    await save(ADA, 'Hello')
    expect((await repo.read(BOB))?.signature).toBe('')
  })

  it('returns null for a member who is not there, or is deleted', async () => {
    expect(await repo.read(4242)).toBeNull()

    await db.execute(sql`update users set deleted_at = now() where id = ${BOB}`)
    expect(await repo.read(BOB)).toBeNull()
  })
})

describe('the lock', () => {
  it('refuses the write in the query rather than by a prior check', async () => {
    /*
     * The race this closes: a moderator locking a signature while the member
     * has the form open. A read-then-write would lose it.
     */
    await save(ADA, 'Hello')
    await repo.setLocked({ userId: ADA, locked: true, reason: 'Advertising.' })

    expect(await save(ADA, 'Hello again')).toBe(false)
    expect((await repo.read(ADA))?.signature).toBe('Hello')
  })

  it('keeps the text, so an appeal can see what was there', async () => {
    await save(ADA, 'Buy my thing')
    await repo.setLocked({ userId: ADA, locked: true, reason: 'Advertising.' })

    expect(await repo.read(ADA)).toMatchObject({
      signature: 'Buy my thing',
      locked: true,
      lockedReason: 'Advertising.',
    })
  })

  it('lets writing resume once unlocked, and clears the reason', async () => {
    await repo.setLocked({ userId: ADA, locked: true, reason: 'Advertising.' })
    await repo.setLocked({ userId: ADA, locked: false, reason: null })

    expect(await save(ADA, 'Something else')).toBe(true)
    expect(await repo.read(ADA)).toMatchObject({
      signature: 'Something else',
      locked: false,
      lockedReason: null,
    })
  })

  it('locks one member without touching another', async () => {
    await repo.setLocked({ userId: ADA, locked: true, reason: 'Advertising.' })
    expect((await repo.read(BOB))?.locked).toBe(false)
    expect(await save(BOB, 'Fine')).toBe(true)
  })
})

describe('readMany', () => {
  it('answers a whole page in one query', async () => {
    await save(ADA, 'Ada here')
    await save(BOB, 'Bob here')

    const many = await repo.readMany([ADA, BOB, 4242])
    expect(many.get(ADA)?.signature).toBe('Ada here')
    expect(many.get(BOB)?.signature).toBe('Bob here')
    /* An id with no row is simply absent, not an error. */
    expect(many.has(4242)).toBe(false)
  })

  it('includes locked and empty ones, leaving the decision to the caller', async () => {
    /*
     * `signatureHtml` answers "should this be shown" in exactly one place, so
     * the query does not answer it a second time.
     */
    await save(ADA, 'Ada here')
    await repo.setLocked({ userId: ADA, locked: true, reason: 'x' })

    const many = await repo.readMany([ADA, BOB])
    expect(many.get(ADA)?.locked).toBe(true)
    expect(many.get(BOB)?.signature).toBe('')
  })

  it('does nothing at all for an empty list', async () => {
    expect(await repo.readMany([])).toEqual(new Map())
  })
})
