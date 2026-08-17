import { beforeEach, describe, expect, it } from 'vitest'

import { hashToken } from './crypto/tokens'
import { createMemoryStore } from './memory-repos'
import { type AccountStore, REMEMBER_ROTATION_GRACE_SECONDS } from './ports'
import { SessionService } from './session-service'

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

  it('startRemembered issues a usable remember token and a session', async () => {
    const svc = makeService(store)
    const login = await svc.startRemembered(42)

    expect(login.userId).toBe(42)
    expect(login.sessionToken).toBeTypeOf('string')
    expect(login.rememberToken).toBeTypeOf('string')
    expect(await store.sessions.findByTokenHash(await hashToken(login.sessionToken))).not.toBeNull()
    expect(await store.remember.findByTokenHash(login.rememberToken)).toBeNull()
    expect(
      await store.remember.findByTokenHash(await hashToken(login.rememberToken)),
    ).not.toBeNull()
  })

  it('resume rotates the token: the presented one dies, a fresh one works', async () => {
    const svc = makeService(store)
    const first = await svc.startRemembered(7)

    const r1 = await svc.resume(first.rememberToken)
    expect(r1.status).toBe('ok')
    if (r1.status !== 'ok') return
    expect(r1.login.rememberToken).not.toBe(first.rememberToken)
    expect(r1.login.sessionToken).not.toBe(first.sessionToken)

    const r2 = await svc.resume(r1.login.rememberToken)
    expect(r2.status).toBe('ok')
  })

  it('detects reuse of a spent token and burns the whole family + all sessions', async () => {
    const clock = movableClock()
    const svc = makeService(store, clock.now)
    const first = await svc.startRemembered(99)

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
    const clock = movableClock()
    const svc = makeService(store, clock.now)
    const first = await svc.startRemembered(11)

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
    const clock = movableClock()
    const svc = makeService(store, clock.now)
    const first = await svc.startRemembered(12)

    const good = await svc.resume(first.rememberToken)
    expect(good.status).toBe('ok')

    clock.advanceSeconds(REMEMBER_ROTATION_GRACE_SECONDS + 1)
    expect((await svc.resume(first.rememberToken)).status).toBe('reuse')

    clock.advanceSeconds(1)
    expect((await svc.resume(first.rememberToken)).status).toBe('reuse')
  })

  it('returns invalid for an unknown token and never touches state', async () => {
    const svc = makeService(store)
    const outcome = await svc.resume('not-a-real-token')
    expect(outcome.status).toBe('invalid')
  })
})
