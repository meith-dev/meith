import { describe, expect, it, vi } from 'vitest'

import {
  type ApiTokenRecord,
  type ApiTokenRepository,
  authenticateToken,
  bearerFrom,
  consumeRateLimit,
  DEFAULT_WINDOW,
  hashTokenSecret,
  hasScope,
  idParam,
  isScope,
  issueToken,
  matchRoute,
  parseToken,
  ROUTES,
  rateLimitHeaders,
  routeKey,
  SCOPES,
  windowStart,
} from './index'

const NOW = new Date('2026-03-12T09:14:00.000Z')

function tokenRecord(overrides: Partial<ApiTokenRecord> = {}): ApiTokenRecord {
  const issued = issueToken()
  return {
    id: 1,
    userId: 7,
    name: 'ci',
    lookup: issued.lookup,
    secretHash: issued.secretHash,
    scopes: ['forums:read'],
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  }
}

function repositoryOf(record: ApiTokenRecord | null): ApiTokenRepository {
  return {
    findByLookup: async (lookup) => (record !== null && record.lookup === lookup ? record : null),
    touch: async () => {},
  }
}

describe('token shape', () => {
  it('mints a greppable, three-part token and stores only a hash', () => {
    const issued = issueToken()

    expect(issued.token.startsWith('forum_pat_')).toBe(true)
    expect(issued.token).toContain(issued.lookup)
    expect(issued.token).not.toContain(issued.secretHash)
    expect(issued.secretHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('mints a different token every time', () => {
    const seen = new Set(Array.from({ length: 20 }, () => issueToken().token))
    expect(seen.size).toBe(20)
  })

  it('round-trips through the parser', () => {
    const issued = issueToken()
    const parsed = parseToken(issued.token)

    expect(parsed?.lookup).toBe(issued.lookup)
    expect(hashTokenSecret(parsed!.secret)).toBe(issued.secretHash)
  })

  it.each([
    'nope',
    'forum_pat_short_secretsecretsecretsecret',
    'forum_pat__secretsecretsecretsecret',
    'forum_pat_abcdef12_tooshort',
    'forum_pat_abcdef12',
    'other_pat_abcdef12_secretsecretsecretsecret',
  ])('refuses the malformed token %o', (value) => {
    expect(parseToken(value)).toBeNull()
  })

  it('reads a bearer header in either case, and nothing else', () => {
    expect(bearerFrom('Bearer abc')).toBe('abc')
    expect(bearerFrom('bearer abc')).toBe('abc')
    expect(bearerFrom('  Bearer   abc  ')).toBe('abc')
    expect(bearerFrom('Basic abc')).toBeNull()
    expect(bearerFrom('abc')).toBeNull()
    expect(bearerFrom(null)).toBeNull()
  })
})

describe('authenticating a token', () => {
  it('accepts the token it issued', async () => {
    const issued = issueToken()
    const record = tokenRecord({ lookup: issued.lookup, secretHash: issued.secretHash })

    const outcome = await authenticateToken(issued.token, repositoryOf(record), NOW)
    expect(outcome).toEqual({ ok: true, token: record })
  })

  it('refuses an unknown lookup', async () => {
    const outcome = await authenticateToken(issueToken().token, repositoryOf(null), NOW)
    expect(outcome).toEqual({ ok: false, reason: 'unknown' })
  })

  it('refuses a wrong secret for a real lookup', async () => {
    const issued = issueToken()
    const record = tokenRecord({ lookup: issued.lookup, secretHash: hashTokenSecret('other') })

    const outcome = await authenticateToken(issued.token, repositoryOf(record), NOW)
    expect(outcome).toEqual({ ok: false, reason: 'bad-secret' })
  })

  it('refuses a revoked token', async () => {
    const issued = issueToken()
    const record = tokenRecord({
      lookup: issued.lookup,
      secretHash: issued.secretHash,
      revokedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    expect(await authenticateToken(issued.token, repositoryOf(record), NOW)).toEqual({
      ok: false,
      reason: 'revoked',
    })
  })

  it('refuses an expired token, and accepts one expiring later', async () => {
    const issued = issueToken()
    const base = { lookup: issued.lookup, secretHash: issued.secretHash }

    const expired = tokenRecord({ ...base, expiresAt: new Date(NOW.getTime() - 1000) })
    expect((await authenticateToken(issued.token, repositoryOf(expired), NOW)).ok).toBe(false)

    const live = tokenRecord({ ...base, expiresAt: new Date(NOW.getTime() + 1000) })
    expect((await authenticateToken(issued.token, repositoryOf(live), NOW)).ok).toBe(true)
  })

  it('answers a wrong secret before it answers revoked', async () => {
    const issued = issueToken()
    const record = tokenRecord({
      lookup: issued.lookup,
      secretHash: hashTokenSecret('other'),
      revokedAt: NOW,
    })

    expect(await authenticateToken(issued.token, repositoryOf(record), NOW)).toEqual({
      ok: false,
      reason: 'bad-secret',
    })
  })

  it('does not look anything up for a malformed token', async () => {
    const findByLookup = vi.fn()
    await authenticateToken('nonsense', { findByLookup, touch: async () => {} }, NOW)
    expect(findByLookup).not.toHaveBeenCalled()
  })
})

describe('scopes', () => {
  it('recognises exactly the declared set', () => {
    expect(isScope('posts:write')).toBe(true)
    expect(isScope('posts:delete')).toBe(false)
    expect(isScope('threads:write')).toBe(false)
    expect(isScope('admin:read')).toBe(false)
  })

  it('answers only for the scopes a token carries', () => {
    const token = tokenRecord({ scopes: ['forums:read', 'threads:read'] })
    expect(hasScope(token, 'forums:read')).toBe(true)
    expect(hasScope(token, 'posts:write')).toBe(false)
  })

  it('offers no scope that no route consumes', () => {
    const consumed = new Set<string>(ROUTES.map((route) => route.scope))
    expect(SCOPES.filter((scope) => !consumed.has(scope))).toEqual([])
  })

  it('offers no administrative scope', () => {
    expect(SCOPES.filter((scope) => scope.startsWith('admin:'))).toEqual([])
  })
})

describe('the route registry', () => {
  it('gives every route a scope, a summary and a positive cost', () => {
    for (const route of ROUTES) {
      expect(isScope(route.scope)).toBe(true)
      expect(route.summary.length).toBeGreaterThan(15)
      expect(route.cost).toBeGreaterThan(0)
    }
  })

  it('declares no route twice', () => {
    const keys = ROUTES.map(routeKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('prices the expensive endpoints higher', () => {
    const search = ROUTES.find((route) => route.path === '/search')
    const me = ROUTES.find((route) => route.path === '/me')
    expect(search!.cost).toBeGreaterThan(me!.cost)
  })

  it('matches a literal route and extracts parameters', () => {
    expect(matchRoute('GET', '/forums')?.route.path).toBe('/forums')

    const matched = matchRoute('GET', '/threads/91/posts')
    expect(matched?.route.path).toBe('/threads/:threadId/posts')
    expect(matched?.params).toEqual({ threadId: '91' })
  })

  it('distinguishes methods on one path', () => {
    expect(matchRoute('GET', '/threads/91/posts')?.route.scope).toBe('posts:read')
    expect(matchRoute('POST', '/threads/91/posts')?.route.scope).toBe('posts:write')
  })

  it.each([
    ['GET', '/threads/91/posts/extra'],
    ['GET', '/threads/91/../../admin'],
    ['GET', '/threads'],
    ['DELETE', '/forums'],
    ['GET', '/unknown'],
  ])('refuses %s %s', (method, path) => {
    expect(matchRoute(method, path)).toBeNull()
  })

  it('reads a positive integer parameter and refuses everything else', () => {
    expect(idParam('91')).toBe(91)
    expect(idParam('0')).toBeNull()
    expect(idParam('-1')).toBeNull()
    expect(idParam('1.5')).toBeNull()
    expect(idParam('91abc')).toBeNull()
    expect(idParam(undefined)).toBeNull()
  })
})

describe('the rate limit', () => {
  const storeReturning = (total: number) => ({ consume: async () => total })

  it('aligns the window so every instance agrees on its start', () => {
    const start = windowStart(new Date('2026-03-12T09:14:37.000Z'), DEFAULT_WINDOW)
    expect(start.toISOString()).toBe('2026-03-12T09:10:00.000Z')
  })

  it('allows a request that lands exactly on the budget', async () => {
    const outcome = await consumeRateLimit(storeReturning(600), 1, 1, NOW)
    expect(outcome.allowed).toBe(true)
    expect(outcome.used).toBe(600)
  })

  it('refuses the one that goes over', async () => {
    const outcome = await consumeRateLimit(storeReturning(601), 1, 1, NOW)
    expect(outcome.allowed).toBe(false)
  })

  it('reports the seconds until the window rolls', async () => {
    const outcome = await consumeRateLimit(
      storeReturning(1),
      1,
      1,
      new Date('2026-03-12T09:14:37.000Z'),
    )
    expect(outcome.resetSeconds).toBe(23)
  })

  it('charges the declared cost, not one per request', async () => {
    const consume = vi.fn(async () => 10)
    await consumeRateLimit({ consume }, 1, 10, NOW)
    expect(consume).toHaveBeenCalledWith(1, windowStart(NOW, DEFAULT_WINDOW), 10)
  })

  it('reports the budget on every response', async () => {
    const headers = rateLimitHeaders(await consumeRateLimit(storeReturning(100), 1, 1, NOW))
    expect(headers['x-ratelimit-limit']).toBe('600')
    expect(headers['x-ratelimit-remaining']).toBe('500')
  })

  it('never reports a negative remaining budget', async () => {
    const headers = rateLimitHeaders(await consumeRateLimit(storeReturning(900), 1, 1, NOW))
    expect(headers['x-ratelimit-remaining']).toBe('0')
  })
})
