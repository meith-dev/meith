import { beforeEach, describe, expect, it } from 'vitest'

import { hashToken } from './crypto/tokens'
import { createMemoryStore } from './memory-repos'
import type { AccountStore } from './ports'
import { SessionService } from './session-service'

function makeService(store: AccountStore) {
  return new SessionService({ store, rememberDays: 30, sessionIdleDays: 7 })
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
    // The session is keyed by hash, resolvable by the hash of the plaintext.
    expect(
      await store.sessions.findByTokenHash(await hashToken(login.sessionToken)),
    ).not.toBeNull()
    // The remember token is stored hashed, not in plaintext.
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
    // Rotation issued a DIFFERENT token (single-use chain).
    expect(r1.login.rememberToken).not.toBe(first.rememberToken)
    // ...and a fresh session token (fixation defence: never reuse the session id).
    expect(r1.login.sessionToken).not.toBe(first.sessionToken)

    // The freshly-rotated token continues the chain.
    const r2 = await svc.resume(r1.login.rememberToken)
    expect(r2.status).toBe('ok')
  })

  it('detects reuse of a spent token and burns the whole family + all sessions', async () => {
    const svc = makeService(store)
    const first = await svc.startRemembered(99)

    // Honest client rotates once.
    const good = await svc.resume(first.rememberToken)
    expect(good.status).toBe('ok')
    if (good.status !== 'ok') return

    // Attacker replays the ORIGINAL (now-spent) token.
    const replay = await svc.resume(first.rememberToken)
    expect(replay.status).toBe('reuse')
    if (replay.status !== 'reuse') return
    expect(replay.userId).toBe(99)

    // Fallout: the token the honest client just obtained is now dead too (whole
    // family revoked). Presenting a *revoked* token is still a reuse signal, not
    // an unknown-token 'invalid' — so the honest client also cannot rotate, and
    // re-presenting keeps tripping the breach response idempotently.
    const afterReuse = await svc.resume(good.login.rememberToken)
    expect(afterReuse.status).not.toBe('ok')
    expect(afterReuse.status).toBe('reuse')

    const session = await store.sessions.findByTokenHash(
      await hashToken(good.login.sessionToken),
    )
    expect(session!.revokedAt).not.toBeNull()
  })

  it('returns invalid for an unknown token and never touches state', async () => {
    const svc = makeService(store)
    const outcome = await svc.resume('not-a-real-token')
    expect(outcome.status).toBe('invalid')
  })
})
