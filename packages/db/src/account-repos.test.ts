import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from './pglite.fixture'
import {
  createPostgresAccountStore,
} from './account-repos'
import { credentialTokens, loginAttempts, rememberTokens, sessions, usergroups } from './schema'
import type { AccountStore } from '@forum/accounts'

/**
 * These run against real Postgres (PGlite). The point is the SQL semantics the
 * in-memory store cannot prove: the conditional single-use `consume`, the
 * live-only revocation, and the windowed failure count. Booting the schema is
 * expensive (~2s), so one database is shared and the mutable tables are cleared
 * between tests; the seeded group and user are stable.
 */
describe('Postgres account repositories', () => {
  let h: TestDb
  let store: AccountStore
  let userId: number

  beforeAll(async () => {
    h = await createTestDb()
    store = createPostgresAccountStore(h.db)

    await h.db.insert(usergroups).values({
      id: 2,
      key: 'registered',
      title: 'Registered',
      isSystem: true,
    })
    const acc = await store.accounts.create({
      username: 'Alice',
      usernameLower: 'alice',
      email: 'Alice@Example.com',
      emailLower: 'alice@example.com',
      passwordHash: 'hash',
      passwordAlgo: 'argon2id',
      state: 'active',
      primaryGroupId: 2,
    })
    userId = acc.id
  })

  afterAll(async () => {
    await h.close()
  })

  beforeEach(async () => {
    await h.db.delete(credentialTokens)
    await h.db.delete(rememberTokens)
    await h.db.delete(sessions)
    await h.db.delete(loginAttempts)
  })

  describe('AccountRepository', () => {
    it('creates and finds by lowercased username and email', async () => {
      expect((await store.accounts.findByUsernameLower('alice'))?.username).toBe('Alice')
      expect((await store.accounts.findByEmailLower('alice@example.com'))?.id).toBe(userId)
      // The mixed-case forms are NOT stored in the lower columns.
      expect(await store.accounts.findByUsernameLower('Alice')).toBeNull()
    })

    it('updates the password hash and algorithm', async () => {
      await store.accounts.updatePassword(userId, 'newhash', 'argon2id')
      expect((await store.accounts.findById(userId))?.passwordHash).toBe('newhash')
    })
  })

  describe('CredentialTokenRepository.consume — single-use guard', () => {
    const future = new Date(Date.now() + 60_000)
    const now = () => new Date()

    it('returns the row exactly once, then null (single-use)', async () => {
      await store.tokens.issue({
        tokenHash: 'tok-A',
        userId,
        purpose: 'password_reset',
        expiresAt: future,
      })

      const first = await store.tokens.consume('tok-A', 'password_reset', now())
      expect(first).toEqual({ userId, payload: null })

      const second = await store.tokens.consume('tok-A', 'password_reset', now())
      expect(second).toBeNull()
    })

    it('refuses an expired token', async () => {
      await store.tokens.issue({
        tokenHash: 'tok-exp',
        userId,
        purpose: 'password_reset',
        expiresAt: new Date(Date.now() - 1000),
      })
      expect(await store.tokens.consume('tok-exp', 'password_reset', now())).toBeNull()
    })

    it('refuses a purpose mismatch', async () => {
      await store.tokens.issue({
        tokenHash: 'tok-vp',
        userId,
        purpose: 'email_verification',
        expiresAt: future,
      })
      expect(await store.tokens.consume('tok-vp', 'password_reset', now())).toBeNull()
      // The correct purpose still works afterwards (the mismatch did not consume).
      expect(await store.tokens.consume('tok-vp', 'email_verification', now())).toEqual({
        userId,
        payload: null,
      })
    })

    it('revokeAllForUser makes outstanding tokens unconsumable', async () => {
      await store.tokens.issue({
        tokenHash: 'tok-r',
        userId,
        purpose: 'password_reset',
        expiresAt: future,
      })
      await store.tokens.revokeAllForUser(userId, 'password_reset')
      expect(await store.tokens.consume('tok-r', 'password_reset', now())).toBeNull()
    })
  })

  describe('SessionRepository', () => {
    it('creates hashed, finds by hash, and returns null for an unknown hash', async () => {
      await store.sessions.create({
        tokenHash: 'sess-hash',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      })
      expect((await store.sessions.findByTokenHash('sess-hash'))?.userId).toBe(userId)
      expect(await store.sessions.findByTokenHash('nope')).toBeNull()
    })

    it('revokeAllForUser only stamps live sessions (audit trail stays honest)', async () => {
      await store.sessions.create({ tokenHash: 's1', userId, expiresAt: new Date(Date.now() + 60_000) })
      await store.sessions.revokeAllForUser(userId)
      const firstStamp = (await store.sessions.findByTokenHash('s1'))!.revokedAt
      expect(firstStamp).not.toBeNull()

      // A second sweep must not move the already-set timestamp.
      await new Promise((r) => setTimeout(r, 5))
      await store.sessions.revokeAllForUser(userId)
      const secondStamp = (await store.sessions.findByTokenHash('s1'))!.revokedAt
      expect(secondStamp).toEqual(firstStamp)
    })

    it('supersede links old→new and revokes the old row in one write', async () => {
      const oldS = await store.sessions.create({ tokenHash: 'old', userId, expiresAt: new Date(Date.now() + 60_000) })
      const newS = await store.sessions.create({ tokenHash: 'new', userId, expiresAt: new Date(Date.now() + 60_000) })
      const now = new Date()
      await store.sessions.supersede(oldS.id, newS.id, now)

      const reread = (await store.sessions.findByTokenHash('old'))!
      expect(reread.supersededBySessionId).toBe(newS.id)
      expect(reread.revokedAt).not.toBeNull()
      // The replacement stays live.
      expect((await store.sessions.findByTokenHash('new'))!.revokedAt).toBeNull()
    })

    it('touchLocation writes once, then skips inside the throttle window', async () => {
      const s = await store.sessions.create({ tokenHash: 'loc', userId, expiresAt: new Date(Date.now() + 60_000) })
      const t0 = new Date()
      const loc = { path: '/f/1', forumId: 1, threadId: null }

      // First touch on a session created just now: last_seen_at == created ~now,
      // so a 60s window would skip it. Use t0 far enough ahead to guarantee the
      // first write, then a second touch inside the window must be a no-op.
      const later = new Date(t0.getTime() + 120_000)
      const wrote1 = await store.sessions.touchLocation(s.id, loc, later, 60)
      expect(wrote1).toBe(true)

      const wrote2 = await store.sessions.touchLocation(s.id, { path: '/f/2', forumId: 2, threadId: null }, new Date(later.getTime() + 10_000), 60)
      expect(wrote2).toBe(false)

      // Past the window, it writes again.
      const wrote3 = await store.sessions.touchLocation(s.id, loc, new Date(later.getTime() + 61_000), 60)
      expect(wrote3).toBe(true)
    })
  })

  describe('RememberTokenRepository.rotate — single-use chain + reuse detection', () => {
    const future = () => new Date(Date.now() + 3_600_000)

    it('rotates once: presented token dies, a new one in the same family lives', async () => {
      await store.remember.issue({ tokenHash: 'r0', familyId: 'fam', userId, expiresAt: future() })
      const out = await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'r1',
        now: new Date(),
        nextExpiresAt: future(),
      })
      expect(out).toEqual({ status: 'rotated', userId, familyId: 'fam' })
      // r0 is now spent; r1 is live in the same family.
      expect((await store.remember.findByTokenHash('r0'))!.usedAt).not.toBeNull()
      expect((await store.remember.findByTokenHash('r1'))!.usedAt).toBeNull()
    })

    it('flags reuse when a spent token is presented again', async () => {
      await store.remember.issue({ tokenHash: 'r0', familyId: 'fam', userId, expiresAt: future() })
      await store.remember.rotate({ presentedHash: 'r0', nextHash: 'r1', now: new Date(), nextExpiresAt: future() })

      const replay = await store.remember.rotate({ presentedHash: 'r0', nextHash: 'rX', now: new Date(), nextExpiresAt: future() })
      expect(replay).toEqual({ status: 'reuse', userId, familyId: 'fam' })
      // The replay must NOT have minted rX.
      expect(await store.remember.findByTokenHash('rX')).toBeNull()
    })

    it('returns invalid for an unknown token', async () => {
      const out = await store.remember.rotate({ presentedHash: 'ghost', nextHash: 'n', now: new Date(), nextExpiresAt: future() })
      expect(out).toEqual({ status: 'invalid' })
    })

    it('revokeFamily makes every token in the family flag reuse on rotate', async () => {
      await store.remember.issue({ tokenHash: 'r0', familyId: 'fam', userId, expiresAt: future() })
      await store.remember.revokeFamily('fam', 'token_reuse', new Date())
      const out = await store.remember.rotate({ presentedHash: 'r0', nextHash: 'n', now: new Date(), nextExpiresAt: future() })
      expect(out.status).toBe('reuse')
    })
  })

  describe('LoginAttemptRepository.countFailuresSince', () => {
    it('counts only failures strictly newer than the window bound, per bucket', async () => {
      const base = Date.now()
      await store.loginAttempts.record('alice', false, new Date(base - 120_000)) // old
      await store.loginAttempts.record('alice', false, new Date(base - 30_000)) // in window
      await store.loginAttempts.record('alice', false, new Date(base - 10_000)) // in window
      await store.loginAttempts.record('alice', true, new Date(base - 5_000)) // success, never counts
      await store.loginAttempts.record('bob', false, new Date(base - 10_000)) // other bucket

      const since = new Date(base - 60_000)
      expect(await store.loginAttempts.countFailuresSince('alice', since)).toBe(2)
      expect(await store.loginAttempts.countFailuresSince('bob', since)).toBe(1)
    })

    it('clear() resets a bucket', async () => {
      await store.loginAttempts.record('alice', false, new Date())
      await store.loginAttempts.clear('alice')
      expect(await store.loginAttempts.countFailuresSince('alice', new Date(0))).toBe(0)
    })
  })
})
