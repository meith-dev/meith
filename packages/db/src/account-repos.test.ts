import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AccountStore } from '@meith/accounts'
import { REMEMBER_ROTATION_GRACE_SECONDS } from '@meith/accounts'
import { truncateIp } from '@meith/core'

import { createPostgresAccountStore } from './account-repos'
import { PostgresModCpRepository } from './modcp-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import {
  credentialTokens,
  loginAttempts,
  rememberTokens,
  sessions,
  usergroups,
  users,
} from './schema'

describe('Postgres account repositories', () => {
  let h: TestDb
  let store: AccountStore
  let userId: number

  beforeAll(async () => {
    h = await createTestDb()
    store = createPostgresAccountStore(h.db)

    const seeded = await h.db.select({ id: usergroups.id }).from(usergroups)
    expect(seeded.map((g) => g.id)).toContain(2)
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
      expect(await store.accounts.findByUsernameLower('Alice')).toBeNull()
    })

    it('updates the password hash and algorithm', async () => {
      await store.accounts.updatePassword(userId, 'newhash', 'argon2id')
      expect((await store.accounts.findById(userId))?.passwordHash).toBe('newhash')
    })

    it('does not return or mutate a tombstoned account', async () => {
      const account = await store.accounts.create({
        username: 'Closed',
        usernameLower: 'closed',
        email: 'closed@example.test',
        emailLower: 'closed@example.test',
        passwordHash: 'oldhash',
        passwordAlgo: 'argon2id',
        state: 'active',
        primaryGroupId: 2,
      })
      await h.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, account.id))

      await store.accounts.updatePassword(account.id, 'newhash', 'argon2id')
      await store.accounts.setState(account.id, 'banned')

      expect(await store.accounts.findById(account.id)).toBeNull()
      expect(await store.accounts.findByUsernameLower('closed')).toBeNull()
      expect(await store.accounts.findByEmailLower('closed@example.test')).toBeNull()
      const [row] = await h.db
        .select({ passwordHash: users.passwordHash, state: users.state })
        .from(users)
        .where(eq(users.id, account.id))
      expect(row).toEqual({ passwordHash: 'oldhash', state: 'active' })
    })
  })

  describe('AccountRepository.markEmailVerified', () => {
    async function waitingAccount(email: string): Promise<number> {
      const created = await store.accounts.create({
        username: email,
        usernameLower: email,
        email,
        emailLower: email,
        passwordHash: 'hash',
        passwordAlgo: 'argon2id',
        state: 'awaiting_activation',
        primaryGroupId: 2,
      })
      return created.id
    }

    it('activates a waiting account and reports the state it replaced', async () => {
      const id = await waitingAccount('waiting@example.com')
      const at = new Date('2026-02-02T10:00:00Z')

      expect(await store.accounts.markEmailVerified(id, at, true)).toBe('awaiting_activation')

      const after = (await store.accounts.findById(id))!
      expect(after.state).toBe('active')
      expect(after.emailVerifiedAt?.toISOString()).toBe(at.toISOString())
    })

    it('leaves a banned account banned', async () => {
      const id = await waitingAccount('banned@example.com')
      await store.accounts.setState(id, 'banned')

      expect(await store.accounts.markEmailVerified(id, new Date(), true)).toBe('banned')
      expect((await store.accounts.findById(id))?.state).toBe('banned')
    })

    it('stamps without activating when asked not to (the "both" policy)', async () => {
      const id = await waitingAccount('both@example.com')

      expect(await store.accounts.markEmailVerified(id, new Date(), false)).toBe(
        'awaiting_activation',
      )
      const after = (await store.accounts.findById(id))!
      expect(after.state).toBe('awaiting_activation')
      expect(after.emailVerifiedAt).not.toBeNull()
    })

    it('keeps the first proof rather than overwriting it', async () => {
      const id = await waitingAccount('twice@example.com')
      const first = new Date('2026-02-02T10:00:00Z')

      await store.accounts.markEmailVerified(id, first, false)
      await store.accounts.markEmailVerified(id, new Date('2026-03-03T10:00:00Z'), true)

      expect((await store.accounts.findById(id))?.emailVerifiedAt?.toISOString()).toBe(
        first.toISOString(),
      )
    })

    it('returns null for an account that no longer exists', async () => {
      expect(await store.accounts.markEmailVerified(999_999, new Date(), true)).toBeNull()
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
      await store.sessions.create({
        tokenHash: 's1',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      })
      await store.sessions.revokeAllForUser(userId)
      const firstStamp = (await store.sessions.findByTokenHash('s1'))!.revokedAt
      expect(firstStamp).not.toBeNull()

      await new Promise((r) => setTimeout(r, 5))
      await store.sessions.revokeAllForUser(userId)
      const secondStamp = (await store.sessions.findByTokenHash('s1'))!.revokedAt
      expect(secondStamp).toEqual(firstStamp)
    })

    it('supersede links old→new and revokes the old row in one write', async () => {
      const oldS = await store.sessions.create({
        tokenHash: 'old',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      })
      const newS = await store.sessions.create({
        tokenHash: 'new',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      })
      const now = new Date()
      await store.sessions.supersede(oldS.id, newS.id, now)

      const reread = (await store.sessions.findByTokenHash('old'))!
      expect(reread.supersededBySessionId).toBe(newS.id)
      expect(reread.revokedAt).not.toBeNull()
      expect((await store.sessions.findByTokenHash('new'))!.revokedAt).toBeNull()
    })

    it('touchLastActive writes once, then skips inside the throttle window', async () => {
      const a = await store.accounts.create({
        username: 'active',
        usernameLower: 'active',
        email: 'active@example.test',
        emailLower: 'active@example.test',
        passwordHash: 'x',
        passwordAlgo: 'argon2id',
        state: 'active',
        primaryGroupId: 2,
      })

      const first = new Date('2026-08-01T12:00:00Z')
      expect(await store.accounts.touchLastActive(a.id, first, 300)).toBe(true)

      const soon = new Date(first.getTime() + 60_000)
      expect(await store.accounts.touchLastActive(a.id, soon, 300)).toBe(false)

      const later = new Date(first.getTime() + 301_000)
      expect(await store.accounts.touchLastActive(a.id, later, 300)).toBe(true)
    })

    it('touchLocation writes once, then skips inside the throttle window', async () => {
      const s = await store.sessions.create({
        tokenHash: 'loc',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      })
      const t0 = new Date()
      const loc = { path: '/f/1', forumId: 1, threadId: null }

      const later = new Date(t0.getTime() + 120_000)
      const wrote1 = await store.sessions.touchLocation(s.id, loc, later, 60)
      expect(wrote1).toBe(true)

      const wrote2 = await store.sessions.touchLocation(
        s.id,
        { path: '/f/2', forumId: 2, threadId: null },
        new Date(later.getTime() + 10_000),
        60,
      )
      expect(wrote2).toBe(false)

      const wrote3 = await store.sessions.touchLocation(
        s.id,
        loc,
        new Date(later.getTime() + 61_000),
        60,
      )
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
      expect((await store.remember.findByTokenHash('r0'))!.usedAt).not.toBeNull()
      expect((await store.remember.findByTokenHash('r1'))!.usedAt).toBeNull()
    })

    it('flags reuse when a spent token is presented again, later', async () => {
      const at = new Date()
      const afterGrace = new Date(at.getTime() + (REMEMBER_ROTATION_GRACE_SECONDS + 1) * 1_000)

      await store.remember.issue({ tokenHash: 'r0', familyId: 'fam', userId, expiresAt: future() })
      await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'r1',
        now: at,
        nextExpiresAt: future(),
      })

      const replay = await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'rX',
        now: afterGrace,
        nextExpiresAt: future(),
      })
      expect(replay).toEqual({ status: 'reuse', userId, familyId: 'fam' })
      expect(await store.remember.findByTokenHash('rX')).toBeNull()
    })

    it('honours a token presented twice inside the grace window', async () => {
      const at = new Date()
      const moments = new Date(at.getTime() + 1_000)

      await store.remember.issue({ tokenHash: 'r0', familyId: 'fam', userId, expiresAt: future() })
      await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'r1',
        now: at,
        nextExpiresAt: future(),
      })

      const concurrent = await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'r2',
        now: moments,
        nextExpiresAt: future(),
      })
      expect(concurrent).toEqual({ status: 'rotated', userId, familyId: 'fam' })
      expect(await store.remember.findByTokenHash('r1')).not.toBeNull()
      expect(await store.remember.findByTokenHash('r2')).not.toBeNull()
    })

    it('refuses a revoked family even inside the grace window', async () => {
      const at = new Date()
      await store.remember.issue({ tokenHash: 'r0', familyId: 'fam', userId, expiresAt: future() })
      await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'r1',
        now: at,
        nextExpiresAt: future(),
      })
      await store.remember.revokeFamily('fam', 'token_reuse', at)

      const out = await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'r2',
        now: new Date(at.getTime() + 1_000),
        nextExpiresAt: future(),
      })
      expect(out.status).toBe('reuse')
      expect(await store.remember.findByTokenHash('r2')).toBeNull()
    })

    it('returns invalid for an unknown token', async () => {
      const out = await store.remember.rotate({
        presentedHash: 'ghost',
        nextHash: 'n',
        now: new Date(),
        nextExpiresAt: future(),
      })
      expect(out).toEqual({ status: 'invalid' })
    })

    it('revokeFamily makes every token in the family flag reuse on rotate', async () => {
      await store.remember.issue({ tokenHash: 'r0', familyId: 'fam', userId, expiresAt: future() })
      await store.remember.revokeFamily('fam', 'token_reuse', new Date())
      const out = await store.remember.rotate({
        presentedHash: 'r0',
        nextHash: 'n',
        now: new Date(),
        nextExpiresAt: future(),
      })
      expect(out.status).toBe('reuse')
    })
  })

  describe('LoginAttemptRepository.countFailuresSince', () => {
    it('counts only failures strictly newer than the window bound, per bucket', async () => {
      const base = Date.now()
      await store.loginAttempts.record('alice', false, new Date(base - 120_000))
      await store.loginAttempts.record('alice', false, new Date(base - 30_000))
      await store.loginAttempts.record('alice', false, new Date(base - 10_000))
      await store.loginAttempts.record('alice', true, new Date(base - 5_000))
      await store.loginAttempts.record('bob', false, new Date(base - 10_000))

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

  describe('the address ranges the moderator panel looks up', () => {
    let modcp: PostgresModCpRepository

    beforeAll(() => {
      modcp = new PostgresModCpRepository(h.db)
    })

    async function joined(name: string, address: string | null): Promise<number> {
      const created = await store.accounts.create({
        username: name,
        usernameLower: name,
        email: `${name}@example.test`,
        emailLower: `${name}@example.test`,
        passwordHash: 'x',
        passwordAlgo: 'argon2id',
        state: 'active',
        primaryGroupId: 2,
        registrationIpPrefix: address === null ? null : (truncateIp(address) ?? null),
      })
      return created.id
    }

    it('keeps the range a registration came from, never the address', async () => {
      const id = await joined('ida', '192.0.2.14')

      expect(await modcp.ipPrefixesFor(id)).toEqual({
        registration: '192.0.2.0/24',
        lastVisit: null,
      })
    })

    it('records a sign-in range without disturbing the registration range', async () => {
      const id = await joined('ines', '192.0.2.14')

      await store.accounts.recordLastIpPrefix(id, truncateIp('198.18.51.9')!)

      expect(await modcp.ipPrefixesFor(id)).toEqual({
        registration: '192.0.2.0/24',
        lastVisit: '198.18.51.0/24',
      })
    })

    it('finds the account sharing a range and leaves an unrelated one out', async () => {
      const iris = await joined('iris', '198.51.100.14')
      const ivo = await joined('ivo', '198.51.100.200')
      const ilse = await joined('ilse', '203.0.113.9')

      const matches = await modcp.ipMatches(iris, 10)

      expect(matches.map((m) => m.userId)).toEqual([ivo])
      expect(matches[0]).toMatchObject({ username: 'ivo', matchedOn: 'registration' })
      expect(matches.map((m) => m.userId)).not.toContain(ilse)
    })

    it('leaves an account with no recorded range out of every lookup', async () => {
      const inge = await joined('inge', null)
      const ingrid = await joined('ingrid', null)

      expect(await modcp.ipMatches(inge, 10)).toEqual([])
      expect((await modcp.ipMatches(ingrid, 10)).map((m) => m.userId)).not.toContain(inge)
    })
  })
})
