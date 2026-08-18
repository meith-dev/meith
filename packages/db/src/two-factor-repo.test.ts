import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AccountStore } from '@meith/accounts'

import { createPostgresAccountStore } from './account-repos'
import { createTestDb, type TestDb } from './pglite.fixture'

describe('Postgres two-factor, recovery code and auth event repositories', () => {
  let h: TestDb
  let store: AccountStore
  let userId: number
  let otherUserId: number

  const now = new Date('2026-08-01T12:00:00Z')

  beforeAll(async () => {
    h = await createTestDb()
    store = createPostgresAccountStore(h.db)

    const account = await store.accounts.create({
      username: 'Ada',
      usernameLower: 'ada',
      email: 'ada@example.com',
      emailLower: 'ada@example.com',
      passwordHash: 'hash',
      passwordAlgo: 'argon2id',
      state: 'active',
      primaryGroupId: 2,
    })
    userId = account.id

    const other = await store.accounts.create({
      username: 'Grace',
      usernameLower: 'grace',
      email: 'grace@example.com',
      emailLower: 'grace@example.com',
      passwordHash: 'hash',
      passwordAlgo: 'argon2id',
      state: 'active',
      primaryGroupId: 2,
    })
    otherUserId = other.id
  })

  afterAll(async () => {
    await h.close()
  })

  beforeEach(async () => {
    await store.twoFactor.remove(userId)
    await store.recoveryCodes.removeAll(userId)
  })

  it('starts an enrolment and reads it back unconfirmed', async () => {
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.aa.bb', now })

    expect(await store.twoFactor.find(userId)).toMatchObject({
      userId,
      sealedSecret: 'v1.aa.bb',
      confirmedAt: null,
      lastStep: null,
    })
  })

  it('replaces an enrolment that was never confirmed', async () => {
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.first', now })
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.second', now })

    expect((await store.twoFactor.find(userId))?.sealedSecret).toBe('v1.second')
  })

  it('will not quietly replace a confirmed one', async () => {
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.kept', now })
    await store.twoFactor.confirm(userId, 100, now)

    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.usurper', now })

    const held = await store.twoFactor.find(userId)
    expect(held?.sealedSecret).toBe('v1.kept')
    expect(held?.confirmedAt).toEqual(now)
  })

  it('confirms once and not twice', async () => {
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.aa', now })

    expect(await store.twoFactor.confirm(userId, 100, now)).toBe(true)
    expect(await store.twoFactor.confirm(userId, 101, now)).toBe(false)
  })

  it('spends a step forwards only, which is what refuses a replayed code', async () => {
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.aa', now })
    await store.twoFactor.confirm(userId, 100, now)

    expect(await store.twoFactor.spendStep(userId, 100)).toBe(false)
    expect(await store.twoFactor.spendStep(userId, 99)).toBe(false)
    expect(await store.twoFactor.spendStep(userId, 101)).toBe(true)
    expect((await store.twoFactor.find(userId))?.lastStep).toBe(101)
  })

  it('holds a step past the range of a 32-bit integer', async () => {
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.aa', now })
    await store.twoFactor.confirm(userId, 3_000_000_000, now)

    expect((await store.twoFactor.find(userId))?.lastStep).toBe(3_000_000_000)
  })

  it('removes the enrolment', async () => {
    await store.twoFactor.startEnrolment({ userId, sealedSecret: 'v1.aa', now })

    expect(await store.twoFactor.remove(userId)).toBe(true)
    expect(await store.twoFactor.remove(userId)).toBe(false)
    expect(await store.twoFactor.find(userId)).toBeNull()
  })

  it('replaces recovery codes as a set and counts what is left', async () => {
    await store.recoveryCodes.replaceAll(userId, ['a', 'b', 'c'], now)
    expect(await store.recoveryCodes.countUnused(userId)).toBe(3)

    await store.recoveryCodes.replaceAll(userId, ['d', 'e'], now)
    expect(await store.recoveryCodes.countUnused(userId)).toBe(2)
    expect(await store.recoveryCodes.spend(userId, 'a', now)).toBe(false)
  })

  it('spends a recovery code once', async () => {
    await store.recoveryCodes.replaceAll(userId, ['a', 'b'], now)

    expect(await store.recoveryCodes.spend(userId, 'a', now)).toBe(true)
    expect(await store.recoveryCodes.spend(userId, 'a', now)).toBe(false)
    expect(await store.recoveryCodes.countUnused(userId)).toBe(1)
  })

  it('keeps one member’s recovery codes away from another’s', async () => {
    await store.recoveryCodes.replaceAll(userId, ['shared'], now)
    await store.recoveryCodes.replaceAll(otherUserId, ['shared'], now)

    expect(await store.recoveryCodes.spend(userId, 'shared', now)).toBe(true)
    expect(await store.recoveryCodes.countUnused(otherUserId)).toBe(1)

    await store.recoveryCodes.removeAll(otherUserId)
  })

  it('records authentication events and reads a member’s own back newest first', async () => {
    await store.authEvents.record({ userId, kind: 'login', at: now, ipPrefix: '203.0.113.0' })
    await store.authEvents.record({
      userId,
      kind: 'password_changed',
      at: now,
      userAgent: 'Mozilla/5.0',
      detail: { by: 'member' },
    })

    const held = await store.authEvents.listForUser(userId, 10)

    expect(held.map((event) => event.kind)).toEqual(['password_changed', 'login'])
    expect(held[0]?.detail).toEqual({ by: 'member' })
    expect(held[1]?.ipPrefix).toBe('203.0.113.0')
  })

  it('records an event with no account behind it, for a login that named nobody', async () => {
    await store.authEvents.record({ userId: null, kind: 'login_failed', at: now })

    const recent = await store.authEvents.listRecent({ limit: 1, kind: 'login_failed' })
    expect(recent[0]?.userId).toBeNull()
  })

  it('pages the board-wide list backwards and filters by kind', async () => {
    for (let index = 0; index < 5; index += 1) {
      await store.authEvents.record({ userId, kind: 'logout', at: now })
    }

    const first = await store.authEvents.listRecent({ limit: 2, kind: 'logout' })
    expect(first).toHaveLength(2)

    const next = await store.authEvents.listRecent({
      limit: 2,
      kind: 'logout',
      before: first[1]!.id,
    })

    expect(next.every((event) => event.id < first[1]!.id)).toBe(true)
  })

  it('prunes only the entries older than the cutoff', async () => {
    const old = new Date('2026-01-01T00:00:00Z')
    await store.authEvents.record({ userId, kind: 'login', at: old })
    await store.authEvents.record({ userId, kind: 'login', at: now })

    const removed = await store.authEvents.pruneBefore(new Date('2026-02-01T00:00:00Z'))

    expect(removed).toBe(1)
    expect(
      (await store.authEvents.listForUser(userId, 100)).every(
        (event) => event.at.getTime() >= old.getTime(),
      ),
    ).toBe(true)
    expect(
      (await store.authEvents.listForUser(userId, 100)).some(
        (event) => event.at.getTime() === old.getTime(),
      ),
    ).toBe(false)
  })

  it('takes no more than the batch it is given', async () => {
    const old = new Date('2025-01-01T00:00:00Z')
    for (let index = 0; index < 3; index += 1) {
      await store.authEvents.record({ userId, kind: 'logout', at: old })
    }

    expect(await store.authEvents.pruneBefore(new Date('2025-06-01T00:00:00Z'), 2)).toBe(2)
    expect(await store.authEvents.pruneBefore(new Date('2025-06-01T00:00:00Z'), 2)).toBe(1)
  })
})
