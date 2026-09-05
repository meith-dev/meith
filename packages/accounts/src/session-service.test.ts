import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ForbiddenError } from '@meith/core'

import { hashToken } from './crypto/tokens'
import { createMemoryStore } from './memory-repos'
import { type AccountStore, REMEMBER_ROTATION_GRACE_SECONDS } from './ports'
import { SessionService } from './session-service'

async function addAccount(store: AccountStore, id: number) {
  for (let current = 1; current <= id; current += 1) {
    await store.accounts.create({
      username: `member${current}`,
      usernameLower: `member${current}`,
      email: `member${current}@example.test`,
      emailLower: `member${current}@example.test`,
      passwordHash: 'hash',
      passwordAlgo: 'argon2id',
      state: 'active',
      primaryGroupId: 2,
    })
  }
}

function makeService(store: AccountStore, clock?: () => Date) {
  return new SessionService({
    store,
    rememberDays: 30,
    sessionLifetimeDays: 7,
    ...(clock === undefined ? {} : { clock }),
  })
}

function movableClock(start = new Date('2026-01-01T00:00:00Z')) {
  let at = start
  return {
    now: () => at,
    advanceSeconds: (seconds: number) => {
      at = new Date(at.getTime() + seconds * 1_000)
    },
  }
}

describe('SessionService remember-me', () => {
  let store: AccountStore
  beforeEach(() => {
    store = createMemoryStore()
  })

  it('issueRemember issues a usable remember token and mints no session', async () => {
    await addAccount(store, 42)
    const svc = makeService(store)
    const remembered = await svc.issueRemember(42)

    expect(remembered.rememberToken).toBeTypeOf('string')
    expect(await store.remember.findByTokenHash(remembered.rememberToken)).toBeNull()
    expect(
      await store.remember.findByTokenHash(await hashToken(remembered.rememberToken)),
    ).not.toBeNull()
    expect(
      await store.sessions.findByTokenHash(await hashToken(remembered.rememberToken)),
    ).toBeNull()
  })

  it('resume rotates the token: the presented one dies, a fresh one works', async () => {
    await addAccount(store, 7)
    const svc = makeService(store)
    const first = await svc.issueRemember(7)

    const r1 = await svc.resume(first.rememberToken)
    expect(r1.status).toBe('ok')
    if (r1.status !== 'ok') return
    expect(r1.login.rememberToken).not.toBe(first.rememberToken)
    expect(r1.login.sessionToken).toBeTypeOf('string')

    const r2 = await svc.resume(r1.login.rememberToken)
    expect(r2.status).toBe('ok')
  })

  it('detects reuse of a spent token and burns the whole family + all sessions', async () => {
    await addAccount(store, 99)
    const clock = movableClock()
    const svc = makeService(store, clock.now)
    const first = await svc.issueRemember(99)

    const good = await svc.resume(first.rememberToken)
    expect(good.status).toBe('ok')
    if (good.status !== 'ok') return

    clock.advanceSeconds(REMEMBER_ROTATION_GRACE_SECONDS + 1)

    const replay = await svc.resume(first.rememberToken)
    expect(replay.status).toBe('reuse')
    if (replay.status !== 'reuse') return
    expect(replay.userId).toBe(99)

    const afterReuse = await svc.resume(good.login.rememberToken)
    expect(afterReuse.status).not.toBe('ok')
    expect(afterReuse.status).toBe('reuse')

    const session = await store.sessions.findByTokenHash(await hashToken(good.login.sessionToken))
    expect(session!.revokedAt).not.toBeNull()
  })

  it('honours the same token twice inside the grace window, signing nobody out', async () => {
    await addAccount(store, 11)
    const clock = movableClock()
    const svc = makeService(store, clock.now)
    const first = await svc.issueRemember(11)

    const winner = await svc.resume(first.rememberToken)
    expect(winner.status).toBe('ok')
    if (winner.status !== 'ok') return

    clock.advanceSeconds(REMEMBER_ROTATION_GRACE_SECONDS - 1)

    const loser = await svc.resume(first.rememberToken)
    expect(loser.status).toBe('ok')
    if (loser.status !== 'ok') return

    expect(loser.login.rememberToken).not.toBe(winner.login.rememberToken)

    for (const token of [winner.login.sessionToken, loser.login.sessionToken]) {
      const session = await store.sessions.findByTokenHash(await hashToken(token))
      expect(session!.revokedAt).toBeNull()
    }
  })

  it('stops honouring a token the moment its family is burned', async () => {
    await addAccount(store, 12)
    const clock = movableClock()
    const svc = makeService(store, clock.now)
    const first = await svc.issueRemember(12)

    const good = await svc.resume(first.rememberToken)
    expect(good.status).toBe('ok')

    clock.advanceSeconds(REMEMBER_ROTATION_GRACE_SECONDS + 1)
    expect((await svc.resume(first.rememberToken)).status).toBe('reuse')

    clock.advanceSeconds(1)
    expect((await svc.resume(first.rememberToken)).status).toBe('reuse')
  })

  it('rechecks account standing before rotating or minting a session', async () => {
    await addAccount(store, 42)
    const allowed = vi.fn(async (_account: unknown) => undefined)
    const issuing = makeService(store)
    const first = await issuing.issueRemember(42)
    const before = await store.remember.findByTokenHash(await hashToken(first.rememberToken))

    const svc = new SessionService({
      store,
      rememberDays: 30,
      sessionLifetimeDays: 7,
      assertSignInAllowed: async (account) => {
        allowed(account)
        throw new ForbiddenError('banned')
      },
    })

    expect((await svc.resume(first.rememberToken)).status).toBe('invalid')
    expect(allowed).toHaveBeenCalledOnce()
    expect(await store.remember.findByTokenHash(await hashToken(first.rememberToken))).toEqual(
      before,
    )
  })

  it('returns invalid for an unknown token and never touches state', async () => {
    const allowed = vi.fn(async () => undefined)
    const svc = new SessionService({
      store,
      rememberDays: 30,
      sessionLifetimeDays: 7,
      assertSignInAllowed: allowed,
    })
    const outcome = await svc.resume('not-a-real-token')
    expect(outcome.status).toBe('invalid')
    expect(allowed).not.toHaveBeenCalled()
  })
})
