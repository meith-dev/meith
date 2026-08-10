import { ForbiddenError, ValidationError } from '@meith/core'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  ADMIN_IDLE_MINUTES,
  ADMIN_MAX_HOURS,
  AdminService,
  REAUTH_MINUTES,
  assertLogAction,
  ipAllowed,
  parseAllowlist,
  staleProof,
} from './index'
import type { AdminSessionRecord, AdminSessionRepository } from './index'

const NOW = new Date('2026-08-02T12:00:00Z')
const USER = 7

function session(overrides: Partial<AdminSessionRecord> = {}): AdminSessionRecord {
  return {
    id: 1,
    userId: USER,
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
  rows: AdminSessionRecord[] = []
  touched: Array<{ id: number; windowSeconds: number }> = []
  reauthed: number[] = []
  revoked: number[] = []
  revokedUsers: number[] = []

  async create(input: {
    userId: number
    tokenHash: string
    ipPrefix: string | null
    expiresAt: Date
    at: Date
  }) {
    const created = session({
      id: this.rows.length + 1,
      userId: input.userId,
      ipPrefix: input.ipPrefix,
      expiresAt: input.expiresAt,
      authenticatedAt: input.at,
      lastSeenAt: input.at,
      createdAt: input.at,
    })
    this.rows.push(created)
    return created
  }

  async findLive(_tokenHash: string, now: Date) {
    return (
      this.rows.find((row) => row.revokedAt === null && row.expiresAt > now) ?? null
    )
  }

  async touch(sessionId: number, _now: Date, _expiresAt: Date, windowSeconds: number) {
    this.touched.push({ id: sessionId, windowSeconds })
  }

  async markReauthenticated(sessionId: number) {
    this.reauthed.push(sessionId)
  }

  async revoke(sessionId: number) {
    this.revoked.push(sessionId)
    this.rows = this.rows.map((row) =>
      row.id === sessionId ? { ...row, revokedAt: NOW } : row,
    )
  }

  async revokeAllForUser(userId: number) {
    this.revokedUsers.push(userId)
  }
}

let repo: FakeSessions
let service: AdminService

beforeEach(() => {
  repo = new FakeSessions()
  service = new AdminService({ sessions: repo, now: () => NOW })
})

describe('parseAllowlist', () => {
  it('reads a comma-separated list, trimming and lowercasing', () => {
    expect(parseAllowlist(' 203.0.113. , 198.51.100.7 ,, 2001:DB8: ')).toEqual([
      '203.0.113.',
      '198.51.100.7',
      '2001:db8:',
    ])
  })

  it('is empty when unset', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist('   ')).toEqual([])
  })
})

describe('ipAllowed', () => {
  it('allows everything when the allowlist is empty', () => {
    expect(ipAllowed('203.0.113.9', [])).toBe(true)
    expect(ipAllowed(null, [])).toBe(true)
  })

  it('matches a whole address exactly', () => {
    expect(ipAllowed('198.51.100.7', ['198.51.100.7'])).toBe(true)
    expect(ipAllowed('198.51.100.70', ['198.51.100.7'])).toBe(false)
  })

  it('matches a prefix only when the entry ends in a dot or colon', () => {
    expect(ipAllowed('203.0.113.9', ['203.0.113.'])).toBe(true)
    expect(ipAllowed('203.0.114.9', ['203.0.113.'])).toBe(false)
    expect(ipAllowed('2001:db8::1', ['2001:db8:'])).toBe(true)
  })

  it('refuses a missing address when an allowlist is configured', () => {
    expect(ipAllowed(null, ['203.0.113.'])).toBe(false)
    expect(ipAllowed('   ', ['203.0.113.'])).toBe(false)
  })

  it('is case-insensitive, for IPv6', () => {
    expect(ipAllowed('2001:DB8::1', parseAllowlist('2001:db8:'))).toBe(true)
  })
})

describe('starting a session', () => {
  it('expires it after the idle window', async () => {
    const created = await service.start({ userId: USER, tokenHash: 'h', ipPrefix: null })
    expect(created.expiresAt.getTime() - NOW.getTime()).toBe(ADMIN_IDLE_MINUTES * 60_000)
  })

  it('records the truncated address it was opened from', async () => {
    const created = await service.start({
      userId: USER,
      tokenHash: 'h',
      ipPrefix: '203.0.113.0',
    })
    expect(created.ipPrefix).toBe('203.0.113.0')
  })
})

describe('resolving a session', () => {
  it('returns the context and extends it', async () => {
    repo.rows = [session()]

    const context = await service.resolve('h')
    expect(context?.userId).toBe(USER)
    expect(repo.touched).toHaveLength(1)
    expect(repo.touched[0]?.windowSeconds).toBeGreaterThan(0)
  })

  it('returns null for anything that is not live', async () => {
    expect(await service.resolve('h')).toBeNull()

    repo.rows = [session({ revokedAt: NOW })]
    expect(await service.resolve('h')).toBeNull()
  })

  it('revokes a session past the absolute ceiling, whatever its expiry says', async () => {
    const old = new Date(NOW.getTime() - (ADMIN_MAX_HOURS + 1) * 3_600_000)
    repo.rows = [session({ createdAt: old })]

    expect(await service.resolve('h')).toBeNull()
    expect(repo.revoked).toEqual([1])
  })

  it('keeps a session just inside the ceiling', async () => {
    const recent = new Date(NOW.getTime() - (ADMIN_MAX_HOURS - 1) * 3_600_000)
    repo.rows = [session({ createdAt: recent })]

    expect(await service.resolve('h')).not.toBeNull()
    expect(repo.revoked).toEqual([])
  })
})

describe('the re-authentication clock', () => {
  it('is fresh immediately after signing in', () => {
    expect(staleProof(session(), NOW)).toBe(false)
  })

  it('goes stale after the window, even while the session is alive', async () => {
    const proved = new Date(NOW.getTime() - (REAUTH_MINUTES + 1) * 60_000)
    repo.rows = [session({ authenticatedAt: proved, lastSeenAt: NOW })]

    const context = await service.resolve('h')
    expect(context?.needsReauth).toBe(true)
  })

  it('refuses a destructive operation on a stale proof, and permits a fresh one', async () => {
    const stale = session({
      authenticatedAt: new Date(NOW.getTime() - (REAUTH_MINUTES + 1) * 60_000),
    })
    expect(() =>
      service.requireFreshProof({ session: stale, userId: USER, needsReauth: true }),
    ).toThrow(ForbiddenError)

    expect(() =>
      service.requireFreshProof({ session: session(), userId: USER, needsReauth: false }),
    ).not.toThrow()
  })

  it('is the only thing `markReauthenticated` moves', async () => {
    await service.markReauthenticated(1)
    expect(repo.reauthed).toEqual([1])
    expect(repo.touched).toEqual([])
  })
})

describe('ending sessions', () => {
  it('revokes one, and every one for a member', async () => {
    await service.end(3)
    expect(repo.revoked).toEqual([3])

    await service.endAllFor(USER)
    expect(repo.revokedUsers).toEqual([USER])
  })
})

describe('assertLogAction', () => {
  it('accepts the dotted keys this board already writes', () => {
    for (const action of ['thread.merge', 'admin.signed_in', 'warning.issue']) {
      expect(() => assertLogAction(action)).not.toThrow()
    }
  })

  it('refuses free text, so the log stays groupable', () => {
    for (const action of ['deleted bob', 'Thread.Merge', 'nodot', '', 'a..b']) {
      expect(() => assertLogAction(action)).toThrow(ValidationError)
    }
  })
})
