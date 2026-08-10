import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresMaintenanceRepository } from './maintenance-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { credentialTokens, sessions, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresMaintenanceRepository

const NOW = new Date('2026-07-30T12:00:00Z')
const USER = 100

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresMaintenanceRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(sessions)
  await db.delete(credentialTokens)
  await db.delete(users)
  await db.insert(users).values({
    id: USER,
    username: 'u',
    usernameLower: 'u',
    email: 'u@example.test',
    emailLower: 'u@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })
})

function hoursFromNow(h: number): Date {
  return new Date(NOW.getTime() + h * 3_600_000)
}

describe('pruneSessions', () => {
  it('deletes an expired session', async () => {
    await db.insert(sessions).values({
      userId: USER,
      tokenHash: 'expired',
      expiresAt: hoursFromNow(-1),
    })

    expect(await repo.pruneSessions(NOW)).toBe(1)
    expect(await db.select({ id: sessions.id }).from(sessions)).toHaveLength(0)
  })

  it('keeps a live session', async () => {
    await db.insert(sessions).values({
      userId: USER,
      tokenHash: 'live',
      expiresAt: hoursFromNow(24),
    })

    expect(await repo.pruneSessions(NOW)).toBe(0)
  })

  it('keeps a recently revoked session through the grace window', async () => {
    await db.insert(sessions).values({
      userId: USER,
      tokenHash: 'just-revoked',
      expiresAt: hoursFromNow(24),
      revokedAt: hoursFromNow(-1),
    })

    expect(await repo.pruneSessions(NOW)).toBe(0)
  })

  it('deletes a session revoked long ago', async () => {
    await db.insert(sessions).values({
      userId: USER,
      tokenHash: 'old-revoked',
      expiresAt: hoursFromNow(24),
      revokedAt: hoursFromNow(-48),
    })

    expect(await repo.pruneSessions(NOW)).toBe(1)
  })

  it('is bounded by the limit', async () => {
    for (let i = 0; i < 10; i++) {
      await db.insert(sessions).values({
        userId: USER,
        tokenHash: `expired-${i}`,
        expiresAt: hoursFromNow(-1),
      })
    }

    expect(await repo.pruneSessions(NOW, 4)).toBe(4)
    expect(await repo.pruneSessions(NOW, 100)).toBe(6)
  })

  it('is idempotent — a second run has nothing to do', async () => {
    await db.insert(sessions).values({
      userId: USER,
      tokenHash: 'expired',
      expiresAt: hoursFromNow(-1),
    })

    expect(await repo.pruneSessions(NOW)).toBe(1)
    expect(await repo.pruneSessions(NOW)).toBe(0)
  })
})

describe('pruneExpiredTokens', () => {
  it('deletes an expired token', async () => {
    await db.insert(credentialTokens).values({
      userId: USER,
      tokenHash: 'expired',
      purpose: 'password_reset',
      expiresAt: hoursFromNow(-1),
    })

    expect(await repo.pruneExpiredTokens(NOW)).toBe(1)
  })

  it('deletes a consumed token even before it expires', async () => {
    await db.insert(credentialTokens).values({
      userId: USER,
      tokenHash: 'used',
      purpose: 'password_reset',
      expiresAt: hoursFromNow(24),
      consumedAt: NOW,
    })

    expect(await repo.pruneExpiredTokens(NOW)).toBe(1)
  })

  it('keeps a live unconsumed token', async () => {
    await db.insert(credentialTokens).values({
      userId: USER,
      tokenHash: 'pending',
      purpose: 'password_reset',
      expiresAt: hoursFromNow(1),
    })

    expect(await repo.pruneExpiredTokens(NOW)).toBe(0)
    expect(await db.select({ id: credentialTokens.id }).from(credentialTokens)).toHaveLength(1)
  })

  it('is bounded and idempotent', async () => {
    for (let i = 0; i < 6; i++) {
      await db.insert(credentialTokens).values({
        userId: USER,
        tokenHash: `expired-${i}`,
        purpose: 'password_reset',
        expiresAt: hoursFromNow(-1),
      })
    }

    expect(await repo.pruneExpiredTokens(NOW, 2)).toBe(2)
    expect(await repo.pruneExpiredTokens(NOW, 100)).toBe(4)
    expect(await repo.pruneExpiredTokens(NOW, 100)).toBe(0)
  })
})
