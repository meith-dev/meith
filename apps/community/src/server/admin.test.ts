import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminSessionRecord, AdminSessionRepository } from '@meith/admin'
import { REAUTH_MINUTES } from '@meith/admin'
import type { Actor } from '@meith/authorization'
import { combinePermissionSets, InMemoryAuthorizationSource } from '@meith/authorization'

const now = () => new Date()

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

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const allowlistRef: { current: string | undefined } = { current: undefined }
const hopsRef: { current: number } = { current: 1 }
vi.mock('@meith/core', async () => {
  const actual = await vi.importActual<typeof import('@meith/core')>('@meith/core')
  return {
    ...actual,
    env: new Proxy(
      {},
      {
        get: (_t, key: string) => {
          if (key === 'ADMIN_IP_ALLOWLIST') return allowlistRef.current
          if (key === 'TRUSTED_PROXY_HOPS') return hopsRef.current
          return (actual.env as unknown as Record<string, unknown>)[key]
        },
      },
    ),
  }
})

const { adminPageContext, requireAdmin, requireFreshAdmin, resolveAdmin } = await import('./admin')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const ADA = 1
const BOB = 2

function session(overrides: Partial<AdminSessionRecord> = {}): AdminSessionRecord {
  const at = now()
  return {
    id: 1,
    userId: ADA,
    ipPrefix: '203.0.113.0',
    authenticatedAt: at,
    lastSeenAt: at,
    expiresAt: new Date(at.getTime() + 30 * 60_000),
    revokedAt: null,
    createdAt: at,
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
  hopsRef.current = 1
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
    allowlistRef.current = '198.51.100.'
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    expect(await resolveAdmin()).toEqual({ denied: 'address' })
  })

  it('is consulted before the session store is even resolved', async () => {
    allowlistRef.current = '198.51.100.'
    installTestContainer({ container: { adminSessions: null, adminLog: null } })

    expect(await resolveAdmin()).toEqual({ denied: 'address' })
  })

  it('admits an address inside it', async () => {
    allowlistRef.current = '203.0.113.,198.51.100.7'
    expect(await resolveAdmin()).toHaveProperty('context')
  })

  it('refuses an allowlisted address a caller prepended to the chain', async () => {
    allowlistRef.current = '203.0.113.'
    headerRef.current = { 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' }

    expect(await resolveAdmin()).toEqual({ denied: 'address' })
  })

  it('walks back the configured number of trusted proxies', async () => {
    allowlistRef.current = '203.0.113.'
    headerRef.current = { 'x-forwarded-for': '198.51.100.1, 203.0.113.9, 10.0.0.1' }
    hopsRef.current = 2

    expect(await resolveAdmin()).toHaveProperty('context')
  })

  it('ignores the forwarding header when no proxy is trusted', async () => {
    allowlistRef.current = '203.0.113.'
    hopsRef.current = 0

    expect(await resolveAdmin()).toEqual({ denied: 'address' })
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
    actorRef.current = await actorFor(SEED_GROUP.superModerators, BOB)
    expect(await resolveAdmin()).toEqual({ denied: 'permission' })
  })
})

describe('the ACP session', () => {
  it('asks for a password, blaming nothing, when there is no cookie', async () => {
    tokenRef.current = null
    expect(await resolveAdmin()).toEqual({ denied: 'signin' })
  })

  it('reports a cookie whose session is not live as expired', async () => {
    adminSessions.row = null
    expect(await resolveAdmin()).toEqual({ denied: 'expired' })
  })

  it('refuses a session belonging to somebody else', async () => {
    adminSessions.row = session({ userId: BOB })
    expect(await resolveAdmin()).toEqual({ denied: 'expired' })
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

describe('adminPageContext', () => {
  it('returns the context when every gate passes', async () => {
    expect((await adminPageContext())?.userId).toBe(ADA)
  })

  it('answers null for the denials the layout answers with the sign-in form', async () => {
    tokenRef.current = null
    expect(await adminPageContext()).toBeNull()

    tokenRef.current = 'a-token'
    adminSessions.row = null
    expect(await adminPageContext()).toBeNull()
  })

  it('404s the denials the layout 404s, so the page never renders past one', async () => {
    allowlistRef.current = '198.51.100.'
    await expect(adminPageContext()).rejects.toThrow('NEXT_NOT_FOUND')

    allowlistRef.current = undefined
    actorRef.current = await actorFor(SEED_GROUP.registered, BOB)
    await expect(adminPageContext()).rejects.toThrow('NEXT_NOT_FOUND')

    actorRef.current = await actorFor(SEED_GROUP.administrators, ADA)
    installTestContainer({ container: { adminSessions: null, adminLog: null } })
    await expect(adminPageContext()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('requireFreshAdmin', () => {
  it('permits a destructive operation on a fresh proof', async () => {
    await expect(requireFreshAdmin()).resolves.toBeDefined()
  })

  it('is decided by elapsed time, not by a date the fixture picked', async () => {
    adminSessions.row = session({
      authenticatedAt: new Date(Date.now() - 1_000),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })
    await expect(requireFreshAdmin()).resolves.toBeDefined()

    adminSessions.row = session({
      authenticatedAt: new Date('2025-01-01T00:00:00Z'),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })
    await expect(requireFreshAdmin()).rejects.toThrow(/Confirm your password/)
  })

  it('refuses one whose proof has gone stale, though the session is alive', async () => {
    adminSessions.row = session({
      authenticatedAt: new Date(Date.now() - (REAUTH_MINUTES + 1) * 60_000),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })

    await expect(requireFreshAdmin()).rejects.toThrow(/Confirm your password/)
  })
})
