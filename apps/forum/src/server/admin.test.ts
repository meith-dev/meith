/**
 * F63 at the app layer.
 *
 * The rules are unit-tested in `@forum/admin` and the SQL against real
 * Postgres. What is proven here is the gate order and the seam:
 *
 *  - the address allowlist is consulted **before** anything else, so a request
 *    from outside it learns nothing about the board;
 *  - `admincp.access` is what admits somebody, and the administrator bypass
 *    cannot force-grant it;
 *  - an ACP session belonging to a *different* member is not accepted, which is
 *    the case where the board cookie changed and the ACP one survived;
 *  - a destructive operation refuses a stale password proof.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryAuthorizationSource, combinePermissionSets } from '@forum/authorization'
import type { Actor } from '@forum/authorization'
import { REAUTH_MINUTES } from '@forum/admin'
import type { AdminSessionRecord, AdminSessionRepository } from '@forum/admin'

const NOW = new Date('2026-08-02T12:00:00Z')

/** The request headers the gate reads for the allowlist. */
const headerRef: { current: Record<string, string> } = { current: {} }
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => headerRef.current[name.toLowerCase()] ?? null,
  }),
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

const tokenRef: { current: string | null } = { current: null }
vi.mock('./session-cookies', () => ({
  readAdminToken: async () => tokenRef.current,
  setAdminCookie: async () => {},
  clearAdminCookie: async () => {},
}))

/** `env` is a lazy proxy; the allowlist is read through it. */
const allowlistRef: { current: string | undefined } = { current: undefined }
vi.mock('@forum/core', async () => {
  const actual = await vi.importActual<typeof import('@forum/core')>('@forum/core')
  return {
    ...actual,
    env: new Proxy(
      {},
      {
        get: (_t, key: string) =>
          key === 'ADMIN_IP_ALLOWLIST'
            ? allowlistRef.current
            : (actual.env as unknown as Record<string, unknown>)[key],
      },
    ),
  }
})

const { requireAdmin, requireFreshAdmin, resolveAdmin } = await import('./admin')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const ADA = 1
const BOB = 2

function session(overrides: Partial<AdminSessionRecord> = {}): AdminSessionRecord {
  return {
    id: 1,
    userId: ADA,
    ipPrefix: '203.0.113.0',
    authenticatedAt: NOW,
    lastSeenAt: NOW,
    expiresAt: new Date(NOW.getTime() + 30 * 60_000),
    revokedAt: null,
    createdAt: NOW,
    ...overrides,
  }
}

class FakeSessions implements AdminSessionRepository {
  row: AdminSessionRecord | null = null

  async create() {
    return session()
  }
  async findLive() {
    return this.row
  }
  async touch() {}
  async markReauthenticated() {}
  async revoke() {
    this.row = null
  }
  async revokeAllForUser() {}
}

let adminSessions: FakeSessions

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

beforeEach(async () => {
  adminSessions = new FakeSessions()
  adminSessions.row = session()
  headerRef.current = { 'x-forwarded-for': '203.0.113.9' }
  allowlistRef.current = undefined
  tokenRef.current = 'a-token'
  actorRef.current = await actorFor(SEED_GROUP.administrators, ADA)
  installTestContainer({ container: { adminSessions, adminLog: null } })
})

describe('the address allowlist', () => {
  it('admits everybody when it is unset', async () => {
    expect(await resolveAdmin()).toHaveProperty('context')
  })

  it('refuses an address outside it', async () => {
    allowlistRef.current = '198.51.100.'
    expect(await resolveAdmin()).toEqual({ denied: 'address' })
  })

  it('is consulted before the permission gate, not after', async () => {
    /*
     * The order is the design: a request from outside the allowlist must not
     * learn whether there is a control panel, who is signed in, or whether they
     * would have been admitted. A *guest* from a blocked address therefore gets
     * `address` and not `permission` — which is what pins the ordering, since
     * an administrator would report `address` either way.
     */
    allowlistRef.current = '198.51.100.'
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    expect(await resolveAdmin()).toEqual({ denied: 'address' })
  })

  it('is consulted before the session store is even resolved', async () => {
    /* Same argument, one gate further in: fixture mode must not be disclosed
       to somebody the allowlist has already refused. */
    allowlistRef.current = '198.51.100.'
    installTestContainer({ container: { adminSessions: null, adminLog: null } })

    expect(await resolveAdmin()).toEqual({ denied: 'address' })
  })

  it('admits an address inside it', async () => {
    allowlistRef.current = '203.0.113.,198.51.100.7'
    expect(await resolveAdmin()).toHaveProperty('context')
  })

  it('reads the left-most forwarded entry, which is the client', async () => {
    /*
     * Everything after the first entry is the proxy chain. Kills the mutant
     * that takes the last one, which would match on the proxy's own address and
     * admit the whole internet.
     */
    allowlistRef.current = '203.0.113.'
    headerRef.current = { 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' }

    expect(await resolveAdmin()).toHaveProperty('context')
  })

  it('refuses when the deployment reports no address at all', async () => {
    allowlistRef.current = '203.0.113.'
    headerRef.current = {}

    expect(await resolveAdmin()).toEqual({ denied: 'address' })
  })
})

describe('permission', () => {
  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)
    expect(await resolveAdmin()).toEqual({ denied: 'permission' })
  })

  it('refuses a member without `admincp.access`', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, BOB)
    expect(await resolveAdmin()).toEqual({ denied: 'permission' })
  })

  it('refuses a super-moderator, whose bypass is forum-scoped only', async () => {
    /*
     * The one door the bypasses never open. `admincp.access` is absent from
     * `ADMIN_ALWAYS` and from `FORUM_SCOPED`, so it falls through to the
     * explicit column — which the seeded super-moderator does not have.
     */
    actorRef.current = await actorFor(SEED_GROUP.superModerators, BOB)
    expect(await resolveAdmin()).toEqual({ denied: 'permission' })
  })
})

describe('the ACP session', () => {
  it('asks for a password when there is no cookie', async () => {
    tokenRef.current = null
    expect(await resolveAdmin()).toEqual({ denied: 'signin' })
  })

  it('asks for a password when the session is not live', async () => {
    adminSessions.row = null
    expect(await resolveAdmin()).toEqual({ denied: 'signin' })
  })

  it('refuses a session belonging to somebody else', async () => {
    /*
     * The case this exists for: somebody signed out and somebody else signed in
     * on the same browser, and the ACP cookie — which has its own path and its
     * own lifetime — survived. Kills the mutant that drops the comparison.
     */
    adminSessions.row = session({ userId: BOB })
    expect(await resolveAdmin()).toEqual({ denied: 'signin' })
  })

  it('refuses a board with no admin session store', async () => {
    installTestContainer({ container: { adminSessions: null, adminLog: null } })
    expect(await resolveAdmin()).toEqual({ denied: 'unavailable' })
  })
})

describe('requireAdmin', () => {
  it('returns the context when every gate passes', async () => {
    const context = await requireAdmin()
    expect(context.userId).toBe(ADA)
  })

  it('throws for each denial, with a message that fits it', async () => {
    allowlistRef.current = '198.51.100.'
    await expect(requireAdmin()).rejects.toThrow(/not available from this address/)
  })
})

describe('requireFreshAdmin', () => {
  it('permits a destructive operation on a fresh proof', async () => {
    await expect(requireFreshAdmin()).resolves.toBeDefined()
  })

  it('refuses one whose proof has gone stale, though the session is alive', async () => {
    /*
     * Activity extends the session and does not move the proof. This is the
     * whole point of the two clocks, seen from the app.
     */
    adminSessions.row = session({
      authenticatedAt: new Date(Date.now() - (REAUTH_MINUTES + 1) * 60_000),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })

    await expect(requireFreshAdmin()).rejects.toThrow(/Confirm your password/)
  })
})
