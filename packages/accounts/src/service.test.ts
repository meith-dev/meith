/**
 * Identity service behaviour (F18/F19). Runs entirely against the in-memory
 * store with an injected clock, so lockout windows and token expiry are tested
 * deterministically without sleeping or a database.
 */
import { ForbiddenError, ValidationError } from '@meith/core'
import { argon2id } from 'hash-wasm'
import { beforeEach, describe, expect, it } from 'vitest'

import { rejectionMessage } from './test-support.fixture'

import { hashToken } from './crypto/tokens'
import { createMemoryStore } from './memory-repos'
import { MemoryBanFilters } from './memory-bans'
import { IdentityService, VERIFICATION_TTL_HOURS } from './service'
import type { AccountStore, AuthConfig } from './ports'

const BASE_CONFIG: AuthConfig = {
  minPasswordLength: 8,
  usernameMin: 3,
  usernameMax: 20,
  activationMethod: 'none',
  maxLoginAttempts: 3,
  lockoutMinutes: 15,
  sessionIdleDays: 30,
  resetTokenTtlMinutes: 60,
  reservedUsernames: ['admin', 'root'],
  defaultMemberGroupId: 2,
}

/** A mutable clock the tests advance by hand. */
function fixedClock(start = new Date('2026-01-01T00:00:00Z')) {
  let now = start
  const clock = () => now
  clock.advance = (ms: number) => {
    now = new Date(now.getTime() + ms)
  }
  clock.set = (d: Date) => {
    now = d
  }
  return clock
}

function makeService(
  store: AccountStore,
  overrides: Partial<AuthConfig> = {},
  clock = fixedClock(),
) {
  const service = new IdentityService({
    store,
    config: { ...BASE_CONFIG, ...overrides },
    clock,
  })
  return { service, clock }
}

describe('register', () => {
  let store: AccountStore
  beforeEach(() => {
    store = createMemoryStore()
  })

  it('creates an active account when activation is off', async () => {
    const { service } = makeService(store)
    const { account, verificationToken } = await service.register({
      username: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
    expect(account.state).toBe('active')
    expect(account.usernameLower).toBe('alice')
    expect(verificationToken).toBeUndefined()
    // The stored hash is a real argon2id PHC string, never the plaintext.
    expect(account.passwordHash).toMatch(/^\$argon2id\$/)
    expect(account.passwordHash).not.toContain('correct horse')
  })

  it('holds the account for activation and issues a token when method=email', async () => {
    const { service } = makeService(store, { activationMethod: 'email' })
    const { account, verificationToken } = await service.register({
      username: 'Bob',
      email: 'bob@example.com',
      password: 'correct horse battery',
    })
    expect(account.state).toBe('awaiting_activation')
    expect(verificationToken).toBeTypeOf('string')
  })

  it('rejects a duplicate username case-insensitively', async () => {
    const { service } = makeService(store)
    await service.register({ username: 'Carol', email: 'c@example.com', password: 'correct horse battery' })
    await expect(
      service.register({ username: 'CAROL', email: 'other@example.com', password: 'correct horse battery' }),
    ).rejects.toThrow(/taken/i)
  })

  it('rejects a reserved username', async () => {
    const { service } = makeService(store)
    await expect(
      service.register({ username: 'admin', email: 'a@example.com', password: 'correct horse battery' }),
    ).rejects.toThrow(/reserved/i)
  })

  it('rejects a short password', async () => {
    const { service } = makeService(store)
    await expect(
      service.register({ username: 'Dave', email: 'd@example.com', password: 'short' }),
    ).rejects.toThrow(/at least 8/i)
  })
})

describe('login', () => {
  let store: AccountStore
  beforeEach(async () => {
    store = createMemoryStore()
    const { service } = makeService(store)
    await service.register({
      username: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
  })

  it('issues a session token on correct credentials', async () => {
    const { service } = makeService(store)
    const result = await service.login('alice', 'correct horse battery', 'alice')
    expect(result.sessionToken).toBeTypeOf('string')
    expect(result.sessionToken.length).toBeGreaterThan(20)
    // Storage is keyed by the HASH: the plaintext must NOT find a session...
    expect(await store.sessions.findByTokenHash(result.sessionToken)).toBeNull()
    // ...but the hash of it must.
    expect(await store.sessions.findByTokenHash(await hashToken(result.sessionToken))).not.toBeNull()
  })

  it('accepts login by email as well as username', async () => {
    const { service } = makeService(store)
    await expect(
      service.login('alice@example.com', 'correct horse battery', 'alice'),
    ).resolves.toBeTruthy()
  })

  it('rejects a wrong password with a generic message', async () => {
    const { service } = makeService(store)
    await expect(service.login('alice', 'wrong', 'alice')).rejects.toThrow(
      /incorrect username or password/i,
    )
  })

  it('gives the SAME message for an unknown user (no enumeration)', async () => {
    const { service } = makeService(store)
    await expect(service.login('nobody', 'whatever', 'nobody')).rejects.toThrow(
      /incorrect username or password/i,
    )
  })

  it('locks the bucket after maxLoginAttempts failures, then frees it after the window', async () => {
    const clock = fixedClock()
    const { service } = makeService(store, {}, clock)

    for (let i = 0; i < 3; i++) {
      await expect(service.login('alice', 'wrong', 'alice')).rejects.toThrow(/incorrect/i)
    }
    // 4th attempt is locked out — even with the CORRECT password.
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).rejects.toThrow(/too many/i)

    // After the lockout window passes, the correct password works again.
    clock.advance(16 * 60_000)
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).resolves.toBeTruthy()
  })

  it('a locked bucket does not lock a different account', async () => {
    const { service } = makeService(store)
    await service.register({ username: 'Bob', email: 'bob@example.com', password: 'correct horse battery' })
    for (let i = 0; i < 3; i++) {
      await service.login('alice', 'wrong', 'alice').catch(() => {})
    }
    // Bob's bucket is independent.
    await expect(
      service.login('bob', 'correct horse battery', 'bob'),
    ).resolves.toBeTruthy()
  })

  it('refuses a banned account', async () => {
    const acc = await store.accounts.findByUsernameLower('alice')
    await store.accounts.setState(acc!.id, 'banned')
    const { service } = makeService(store)
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).rejects.toThrow(/banned/i)
  })

  it('upgrades a stale-cost hash on successful login, and leaves a current one alone', async () => {
    // Plant a REAL but under-policy argon2id hash of the known password, as if
    // migrated from a board that used weaker parameters. It must genuinely
    // verify, so we mint it with hash-wasm directly at a lower memory cost.
    const weak = await argon2id({
      password: 'correct horse battery',
      salt: new Uint8Array(16).fill(7),
      parallelism: 1,
      iterations: 2,
      memorySize: 4096, // below policy's 19456 -> needsRehash() must be true
      hashLength: 32,
      outputType: 'encoded',
    })
    const acc = (await store.accounts.findByUsernameLower('alice'))!
    await store.accounts.updatePassword(acc.id, weak, 'argon2id')

    const { service } = makeService(store)
    await service.login('alice', 'correct horse battery', 'alice')

    const after = (await store.accounts.findByUsernameLower('alice'))!.passwordHash!
    expect(after).not.toBe(weak) // upgraded
    expect(after).toContain('m=19456') // to current policy

    // A second login now finds a current-policy hash and must NOT churn it.
    const before2 = after
    await service.login('alice', 'correct horse battery', 'alice')
    const after2 = (await store.accounts.findByUsernameLower('alice'))!.passwordHash!
    expect(after2).toBe(before2)
  })
})

describe('password reset', () => {
  let store: AccountStore
  beforeEach(async () => {
    store = createMemoryStore()
    const { service } = makeService(store)
    await service.register({
      username: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
  })

  it('returns a null token for an unknown email (no enumeration)', async () => {
    const { service } = makeService(store)
    const req = await service.requestPasswordReset('nobody@example.com')
    expect(req.token).toBeNull()
  })

  it('redeems a valid token, changes the password, and is single-use', async () => {
    const { service } = makeService(store)
    const { token } = await service.requestPasswordReset('alice@example.com')
    expect(token).toBeTypeOf('string')

    await service.redeemPasswordReset(token!, 'a brand new password')

    // Old password no longer works; new one does.
    await expect(service.login('alice', 'correct horse battery', 'a')).rejects.toThrow()
    await expect(service.login('alice', 'a brand new password', 'a2')).resolves.toBeTruthy()

    // Second redemption of the same token fails (single-use).
    await expect(
      service.redeemPasswordReset(token!, 'yet another password'),
    ).rejects.toThrow(/invalid or has expired/i)
  })

  it('rejects an expired token', async () => {
    const clock = fixedClock()
    const { service } = makeService(store, { resetTokenTtlMinutes: 30 }, clock)
    const { token } = await service.requestPasswordReset('alice@example.com')

    clock.advance(31 * 60_000)
    await expect(
      service.redeemPasswordReset(token!, 'a brand new password'),
    ).rejects.toThrow(/invalid or has expired/i)
  })

  it('revokes all sessions when a password is reset', async () => {
    const { service } = makeService(store)
    const login = await service.login('alice', 'correct horse battery', 'alice')
    const sessionHash = await hashToken(login.sessionToken)
    expect((await store.sessions.findByTokenHash(sessionHash))!.revokedAt).toBeNull()

    const { token } = await service.requestPasswordReset('alice@example.com')
    await service.redeemPasswordReset(token!, 'a brand new password')

    // The session that existed before the reset is now revoked.
    expect((await store.sessions.findByTokenHash(sessionHash))!.revokedAt).not.toBeNull()
  })

  it('invalidates an older reset token when a newer one is issued', async () => {
    const { service } = makeService(store)
    const first = await service.requestPasswordReset('alice@example.com')
    const second = await service.requestPasswordReset('alice@example.com')

    // Only the newest email works.
    await expect(
      service.redeemPasswordReset(first.token!, 'a brand new password'),
    ).rejects.toThrow(/invalid or has expired/i)
    await expect(
      service.redeemPasswordReset(second.token!, 'a brand new password'),
    ).resolves.toBeUndefined()
  })
})

describe('activation (F18)', () => {
  let store: AccountStore

  /** Register under a policy that mints a verification token. */
  async function registerAwaiting(
    method: 'email' | 'both' = 'email',
    clock = fixedClock(),
  ) {
    const { service } = makeService(store, { activationMethod: method }, clock)
    const { account, verificationToken } = await service.register({
      username: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
    return { service, clock, account, token: verificationToken! }
  }

  beforeEach(() => {
    store = createMemoryStore()
  })

  it('activates a waiting account and lets it sign in', async () => {
    const { service, token, account } = await registerAwaiting()

    // Before: login is refused for the reason F19 gives.
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).rejects.toThrow(/not yet activated/i)

    expect(await service.activateAccount(token)).toBe('activated')

    const after = (await store.accounts.findById(account.id))!
    expect(after.state).toBe('active')
    expect(after.emailVerifiedAt).not.toBeNull()
    await expect(
      service.login('alice', 'correct horse battery', 'alice2'),
    ).resolves.toBeTruthy()
  })

  it('refuses the same token twice', async () => {
    const { service, token } = await registerAwaiting()

    expect(await service.activateAccount(token)).toBe('activated')
    // Single-use is a property of `consume`, and this is the assertion that
    // holds it: a replayed link must not re-activate anything.
    expect(await service.activateAccount(token)).toBe('invalid')
  })

  it('never moves a banned account to active', async () => {
    const { service, token, account } = await registerAwaiting()

    // The ban lands after the link was sent — the case the conditional write
    // exists for. A prior read would have decided "awaiting_activation" and
    // handed the account back.
    await store.accounts.setState(account.id, 'banned')

    expect(await service.activateAccount(token)).toBe('banned')
    expect((await store.accounts.findById(account.id))!.state).toBe('banned')
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).rejects.toThrow(/banned/i)
  })

  it('reports an account somebody already activated', async () => {
    const { service, token, account } = await registerAwaiting()
    await store.accounts.setState(account.id, 'active')

    expect(await service.activateAccount(token)).toBe('already-active')
  })

  it('rejects an expired token', async () => {
    const clock = fixedClock()
    const { service, token } = await registerAwaiting('email', clock)

    clock.advance((VERIFICATION_TTL_HOURS * 60 + 1) * 60_000)
    expect(await service.activateAccount(token)).toBe('invalid')
  })

  it('under "both", proves the address and leaves the account waiting', async () => {
    const { service, token, account } = await registerAwaiting('both')

    expect(await service.activateAccount(token)).toBe('awaiting-approval')

    const after = (await store.accounts.findById(account.id))!
    expect(after.state).toBe('awaiting_activation')
    expect(after.emailVerifiedAt).not.toBeNull()
    // Still not a usable account: the administrator's gate is the second one.
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).rejects.toThrow(/not yet activated/i)
  })

  it('treats a token for a vanished account as invalid', async () => {
    const { service, token } = await registerAwaiting()
    expect(await service.activateAccount('not-a-token')).toBe('invalid')
    expect(await service.activateAccount(token)).toBe('activated')
  })
})

describe('resending a verification link (F18)', () => {
  let store: AccountStore

  beforeEach(() => {
    store = createMemoryStore()
  })

  async function register(method: 'none' | 'email' | 'both') {
    const { service } = makeService(store, { activationMethod: method })
    const result = await service.register({
      username: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
    return { service, account: result.account }
  }

  it('issues a fresh token and invalidates the old one', async () => {
    const { service } = makeService(store, { activationMethod: 'email' })
    const registered = await service.register({
      username: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })

    const resent = await service.resendVerification('alice@example.com')
    expect(resent.token).toBeTypeOf('string')
    expect(resent.account?.username).toBe('Alice')

    // Only the newest link works — the same rule password reset applies.
    expect(await service.activateAccount(registered.verificationToken!)).toBe('invalid')
    expect(await service.activateAccount(resent.token!)).toBe('activated')
  })

  it('sends nothing for an account that is already active', async () => {
    const { service } = await register('none')

    // The account is usable; a "confirm your address" mail would be a message
    // about nothing, and re-issuing a credential for it is worse than useless.
    const resent = await service.resendVerification('alice@example.com')
    expect(resent.token).toBeNull()
    expect(resent.account).toBeNull()
  })

  it('sends nothing for an unknown address (no enumeration)', async () => {
    const { service } = await register('email')
    const resent = await service.resendVerification('nobody@example.com')
    expect(resent.token).toBeNull()
  })

  it('sends nothing for a banned account', async () => {
    const { service, account } = await register('email')
    await store.accounts.setState(account.id, 'banned')

    expect((await service.resendVerification('alice@example.com')).token).toBeNull()
  })

  it('under "both", stops once the address is proven', async () => {
    const { service, account } = await register('both')
    await store.accounts.markEmailVerified(account.id, new Date(), false)

    // Still `awaiting_activation`, but waiting on a person rather than on a
    // link — another link would confirm what is already confirmed.
    expect((await store.accounts.findById(account.id))!.state).toBe('awaiting_activation')
    expect((await service.resendVerification('alice@example.com')).token).toBeNull()
  })

  it('sends nothing when the board does not verify addresses at all', async () => {
    const { account } = await register('email')
    await store.accounts.setState(account.id, 'awaiting_activation')

    // An `admin` board holds accounts for a person to approve, and there is no
    // link to resend — a verification token issued here would redeem into
    // nothing.
    const noVerification = makeService(store, { activationMethod: 'admin' }).service
    expect((await noVerification.resendVerification('alice@example.com')).token).toBeNull()
  })
})

describe('resolveSession', () => {
  let store: AccountStore
  beforeEach(async () => {
    store = createMemoryStore()
    const { service } = makeService(store)
    await service.register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
  })

  it('resolves a live session cookie to its user id', async () => {
    const { service } = makeService(store)
    const login = await service.login('alice', 'correct horse battery', 'alice')
    const resolved = await service.resolveSession(login.sessionToken)
    expect(resolved).toEqual({ userId: login.account.id })
  })

  it('returns null for a forged / unknown token', async () => {
    const { service } = makeService(store)
    expect(await service.resolveSession('not-a-real-token')).toBeNull()
  })

  it('returns null once the session is revoked (logout)', async () => {
    const { service } = makeService(store)
    const login = await service.login('alice', 'correct horse battery', 'alice')
    await service.logout(login.sessionToken)
    expect(await service.resolveSession(login.sessionToken)).toBeNull()
  })

  it('returns null after the session has expired', async () => {
    const clock = fixedClock()
    const { service } = makeService(store, { sessionIdleDays: 1 }, clock)
    const login = await service.login('alice', 'correct horse battery', 'alice')
    expect(await service.resolveSession(login.sessionToken)).not.toBeNull()

    // Step past the idle horizon: the same token no longer resolves.
    clock.advance(2 * 86_400_000)
    expect(await service.resolveSession(login.sessionToken)).toBeNull()
  })

  it('returns null after a password reset kills every session', async () => {
    const { service } = makeService(store)
    const login = await service.login('alice', 'correct horse battery', 'alice')
    const { token } = await service.requestPasswordReset('alice@example.com')
    await service.redeemPasswordReset(token!, 'a brand new password')
    expect(await service.resolveSession(login.sessionToken)).toBeNull()
  })
})

describe('ban filters block registration and login (F23)', () => {
  const CREDS = { username: 'newcomer', email: 'newcomer@spam.example', password: 'long-enough-pw' }

  function serviceWith(filters: MemoryBanFilters) {
    return new IdentityService({
      store: createMemoryStore(),
      config: BASE_CONFIG,
      banFilters: filters,
    })
  }

  it('blocks a filtered email at registration', async () => {
    const filters = new MemoryBanFilters()
    filters.add('email', '*@spam.example')

    await expect(serviceWith(filters).register(CREDS)).rejects.toThrow(ForbiddenError)
  })

  it('blocks a filtered username at registration', async () => {
    const filters = new MemoryBanFilters()
    filters.add('username', 'newcom*')

    await expect(serviceWith(filters).register(CREDS)).rejects.toThrow(ForbiddenError)
  })

  it('blocks a filtered IP at registration', async () => {
    const filters = new MemoryBanFilters()
    filters.add('ip', '192.0.2.*')

    await expect(
      serviceWith(filters).register(CREDS, { ip: '192.0.2.44' }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('lets an unfiltered registration through', async () => {
    const filters = new MemoryBanFilters()
    filters.add('email', '*@other.example')

    await expect(serviceWith(filters).register(CREDS)).resolves.toBeDefined()
  })

  /*
   * The half that is easy to forget. A filter added *after* someone registered
   * has to stop them coming back — otherwise it only keeps out people who were
   * never here, which is not what an administrator adding it expects.
   */
  it('blocks an existing account at login once a filter matches it', async () => {
    const filters = new MemoryBanFilters()
    const service = serviceWith(filters)

    await service.register(CREDS)
    await expect(
      service.login(CREDS.username, CREDS.password, 'bucket'),
    ).resolves.toBeDefined()

    filters.add('email', '*@spam.example')

    await expect(
      service.login(CREDS.username, CREDS.password, 'bucket2'),
    ).rejects.toThrow(ForbiddenError)
  })

  it('blocks a filtered IP at login before spending any hashing budget', async () => {
    const filters = new MemoryBanFilters()
    filters.add('ip', '192.0.2.*')
    const service = serviceWith(filters)

    await expect(
      service.login('anyone', 'whatever', 'bucket', { ip: '192.0.2.9' }),
    ).rejects.toThrow(ForbiddenError)
  })

  /*
   * Checking username/email filters before the password verifies would answer
   * "is this account filtered?" to anyone who can type a username — an
   * enumeration oracle, which login goes to some length elsewhere to avoid.
   */
  it('does not reveal a filter to someone with the wrong password', async () => {
    const filters = new MemoryBanFilters()
    const service = serviceWith(filters)
    await service.register(CREDS)
    filters.add('email', '*@spam.example')

    const attempt = () => service.login(CREDS.username, 'wrong-password', 'bucket3')

    // The generic credential error, not the filter message — otherwise the
    // response distinguishes "filtered" from "wrong password" and becomes the
    // enumeration oracle this ordering exists to prevent.
    await expect(attempt()).rejects.toThrow(ValidationError)
    expect(await rejectionMessage(attempt())).toMatch(/Incorrect username or password/)
  })

  it('names neither the pattern nor the field, which would map a way around it', async () => {
    const filters = new MemoryBanFilters()
    filters.add('email', '*@spam.example')

    const message = await rejectionMessage(serviceWith(filters)
      .register(CREDS))

    expect(message).not.toContain('spam.example')
    expect(message).not.toContain('email')
  })

  it('does nothing when no filter repository is supplied', async () => {
    const service = new IdentityService({ store: createMemoryStore(), config: BASE_CONFIG })
    await expect(service.register(CREDS)).resolves.toBeDefined()
  })
})
