import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { authenticateFeedToken, FEED_TOKEN_PREFIX, issueToken, parseToken } from '@meith/api'

import type { Database } from './client'
import { PostgresFeedTokenRepository } from './feed-token-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresFeedTokenRepository

const ANN = 7
const BOB = 8

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresFeedTokenRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from feed_tokens`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ANN}, 'ann', 'ann', 'ann@example.test', 'ann@example.test', 'x', 'argon2id', 2),
           (${BOB}, 'bob', 'bob', 'bob@example.test', 'bob@example.test', 'x', 'argon2id', 2)
  `)
})

async function storedHash(userId: number): Promise<string | null> {
  const rows = resultRows<{ secret_hash: string }>(
    await db.execute(sql`
      select secret_hash from feed_tokens where user_id = ${userId}
    `),
  )
  return rows[0]?.secret_hash ?? null
}

describe('PostgresFeedTokenRepository', () => {
  it('stores only the hash, never the raw secret', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    await repo.regenerate({ userId: ANN, lookup: issued.lookup, secretHash: issued.secretHash })

    const raw = parseToken(issued.token, FEED_TOKEN_PREFIX)!.secret
    const hash = await storedHash(ANN)

    expect(hash).toBe(issued.secretHash)
    expect(hash).not.toBe(raw)
    expect(hash).not.toContain(raw)
  })

  it('resolves a stored token back to its member', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    await repo.regenerate({ userId: ANN, lookup: issued.lookup, secretHash: issued.secretHash })

    const outcome = await authenticateFeedToken(issued.token, repo)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.record.userId).toBe(ANN)
  })

  it('keeps one token per member: regeneration retires the old lookup', async () => {
    const first = issueToken(FEED_TOKEN_PREFIX)
    await repo.regenerate({ userId: ANN, lookup: first.lookup, secretHash: first.secretHash })

    const second = issueToken(FEED_TOKEN_PREFIX)
    await repo.regenerate({ userId: ANN, lookup: second.lookup, secretHash: second.secretHash })

    expect(await repo.findByLookup(first.lookup)).toBeNull()
    expect((await repo.findByLookup(second.lookup))?.userId).toBe(ANN)

    const rows = resultRows<{ n: number }>(
      await db.execute(sql`
        select count(*)::int as n from feed_tokens where user_id = ${ANN}
      `),
    )
    expect(Number(rows[0]?.n)).toBe(1)
  })

  it('revokes by deleting the row', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    await repo.regenerate({ userId: ANN, lookup: issued.lookup, secretHash: issued.secretHash })

    await repo.revokeForUser(ANN)

    expect(await repo.findByLookup(issued.lookup)).toBeNull()
    expect(await repo.summaryForUser(ANN)).toBeNull()
    expect((await authenticateFeedToken(issued.token, repo)).ok).toBe(false)
  })

  it('reports a summary for the current token', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    await repo.regenerate({ userId: BOB, lookup: issued.lookup, secretHash: issued.secretHash })

    const summary = await repo.summaryForUser(BOB)
    expect(summary?.lookup).toBe(issued.lookup)
    expect(summary?.lastUsedAt).toBeNull()
  })

  it('records last use when touched', async () => {
    const issued = issueToken(FEED_TOKEN_PREFIX)
    await repo.regenerate({ userId: ANN, lookup: issued.lookup, secretHash: issued.secretHash })

    const record = await repo.findByLookup(issued.lookup)
    await repo.touch(record!.id, new Date())

    const summary = await repo.summaryForUser(ANN)
    expect(summary?.lastUsedAt).not.toBeNull()
  })
})
