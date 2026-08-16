import { ForbiddenError, ValidationError } from '@meith/core'
import { argon2id } from 'hash-wasm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { rejectionMessage } from './test-support.fixture'

import { hashToken } from './crypto/tokens'
import { createMemoryStore } from './memory-repos'
import { MemoryBanFilters } from './memory-bans'
import { rejectedField, type RegisterField } from './register-fields'
import {
  IdentityService,
  VERIFICATION_TTL_HOURS,
  type BanLookup,
  type RegisterInput,
} from './service'
import type { AccountStore, AuthConfig } from './ports'

const BASE_CONFIG: AuthConfig = {
  registrationEnabled: true,
  minPasswordLength: 8,
  usernameMin: 3,
  usernameMax: 20,
  activationMethod: 'none',
  maxLoginAttempts: 3,
  maxAccountLoginAttempts: 0,
  lockoutMinutes: 15,
  sessionLifetimeDays: 30,
  resetTokenTtlMinutes: 60,
  reservedUsernames: ['admin', 'root'],
  defaultMemberGroupId: 2,
}

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
  bans?: BanLookup,
) {
  const service = new IdentityService({
    store,
    config: { ...BASE_CONFIG, ...overrides },
    clock,
    ...(bans === undefined ? {} : { bans }),
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
    expect(account.passwordHash).toMatch(/^\$argon2id\$/)
    expect(account.passwordHash).not.toContain('correct horse')
  })

  it('refuses to create an account when registration is closed', async () => {
    const { service } = makeService(store, { registrationEnabled: false })

    await expect(
      service.register({
        username: 'Dana',
        email: 'dana@example.com',
        password: 'correct horse battery',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(await store.accounts.findByUsernameLower('dana')).toBeNull()
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

  describe('measures a username in code points, as the setting says', () => {
    const FOUR_ASTRAL = '𝐇𝐚𝐧𝐬'
    const TWO_ASTRAL = '𝐉𝐨'

    it('accepts a name inside the maximum that would overrun it in code units', async () => {
      expect(FOUR_ASTRAL.length).toBe(8)
      const { service } = makeService(store, { usernameMax: 5 })

      const { account } = await service.register({
        username: FOUR_ASTRAL,
        email: 'hans@example.com',
        password: 'correct horse battery',
      })
      expect(account.username).toBe(FOUR_ASTRAL)
    })

    it('rejects a name under the minimum that would clear it in code units', async () => {
      expect(TWO_ASTRAL.length).toBe(4)
      const { service } = makeService(store, { usernameMin: 3 })

      await expect(
        service.register({
          username: TWO_ASTRAL,
          email: 'jo@example.com',
          password: 'correct horse battery',
        }),
      ).rejects.toThrow(/between 3 and/i)
    })
  })

  describe('names the field it refused', () => {
    const cases: readonly [string, RegisterInput, RegisterField][] = [
      ['a reserved name', { username: 'admin', email: 'a@example.com', password: 'correct horse battery' }, 'username'],
      ['a name of the wrong length', { username: 'ab', email: 'a@example.com', password: 'correct horse battery' }, 'username'],
      ['a name with invalid characters', { username: 'a b/c', email: 'a@example.com', password: 'correct horse battery' }, 'username'],
      ['a malformed address', { username: 'Erin', email: 'not-an-address', password: 'correct horse battery' }, 'email'],
      ['a short password', { username: 'Erin', email: 'e@example.com', password: 'short' }, 'password'],
    ]

    for (const [what, input, field] of cases) {
      it(`blames ${field} for ${what}`, async () => {
        const { service } = makeService(store)
        const error = await service.register(input).catch((err: unknown) => err)
        expect(rejectedField(error)).toBe(field)
      })
    }

    it('blames the taken name, and the taken address', async () => {
      const { service } = makeService(store)
      await service.register({ username: 'Frank', email: 'f@example.com', password: 'correct horse battery' })

      const takenName = await service
        .register({ username: 'FRANK', email: 'other@example.com', password: 'correct horse battery' })
        .catch((err: unknown) => err)
      expect(rejectedField(takenName)).toBe('username')

      const takenEmail = await service
        .register({ username: 'Grace', email: 'F@EXAMPLE.COM', password: 'correct horse battery' })
        .catch((err: unknown) => err)
      expect(rejectedField(takenEmail)).toBe('email')
    })

    it('blames no field for anything that is not a refusal', () => {
      expect(rejectedField(new Error('the database went away'))).toBeNull()
      expect(rejectedField(new ValidationError('something else entirely'))).toBeNull()
      expect(rejectedField(undefined)).toBeNull()
    })
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
    expect(await store.sessions.findByTokenHash(result.sessionToken)).toBeNull()
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
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).rejects.toThrow(/too many/i)

    clock.advance(16 * 60_000)
    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).resolves.toBeTruthy()
  })

  it('a stranger filling their own bucket cannot lock the account owner out', async () => {
    const { service } = makeService(store)
    const attacker = [{ key: 'login:alice@203.0.113.9' }, { key: 'login:alice', max: 50 }]
    const owner = [{ key: 'login:alice@198.51.100.4' }, { key: 'login:alice', max: 50 }]

    for (let i = 0; i < 3; i++) {
      await expect(service.login('alice', 'wrong', attacker)).rejects.toThrow(/incorrect/i)
    }
    await expect(
      service.login('alice', 'correct horse battery', attacker),
    ).rejects.toThrow(/too many/i)

    await expect(
      service.login('alice', 'correct horse battery', owner),
    ).resolves.toBeTruthy()
  })

  it('the account-wide backstop still stops a guess spread across addresses', async () => {
    const { service } = makeService(store)
    const from = (ip: string) => [{ key: `login:alice@${ip}` }, { key: 'login:alice', max: 4 }]

    for (let i = 0; i < 4; i++) {
      await expect(service.login('alice', 'wrong', from(`203.0.113.${i}`))).rejects.toThrow(
        /incorrect/i,
      )
    }

    await expect(
      service.login('alice', 'correct horse battery', from('203.0.113.99')),
    ).rejects.toThrow(/too many/i)
  })

  it('an address-only counter stops a guess sprayed across accounts', async () => {
    const { service } = makeService(store)
    const from = (account: string) => [
      { key: `login:${account}@203.0.113.1` },
      { key: `login:${account}`, max: 50 },
      { key: 'login@203.0.113.0/24', max: 3 },
    ]

    for (const account of ['dave', 'erin', 'frank']) {
      await expect(service.login(account, 'wrong', from(account))).rejects.toThrow(/incorrect/i)
    }

    await expect(
      service.login('alice', 'correct horse battery', from('alice')),
    ).rejects.toThrow(/too many/i)
  })

  it('a success clears the address-only counter too', async () => {
    const { service } = makeService(store)
    const from = (account: string) => [
      { key: `login:${account}@203.0.113.1` },
      { key: 'login@203.0.113.0/24', max: 2 },
    ]

    await expect(service.login('dave', 'wrong', from('dave'))).rejects.toThrow(/incorrect/i)
    await expect(
      service.login('alice', 'correct horse battery', from('alice')),
    ).resolves.toBeTruthy()

    await expect(service.login('erin', 'wrong', from('erin'))).rejects.toThrow(/incorrect/i)
    await expect(
      service.login('alice', 'correct horse battery', from('alice')),
    ).resolves.toBeTruthy()
  })

  it('a success clears every counter, the wide one included', async () => {
    const { service } = makeService(store)
    const buckets = [{ key: 'login:alice@203.0.113.1' }, { key: 'login:alice', max: 4 }]

    for (let i = 0; i < 2; i++) {
      await service.login('alice', 'wrong', buckets).catch(() => {})
    }
    await expect(service.login('alice', 'correct horse battery', buckets)).resolves.toBeTruthy()

    for (let i = 0; i < 2; i++) {
      await expect(service.login('alice', 'wrong', buckets)).rejects.toThrow(/incorrect/i)
    }
    await expect(
      service.login('alice', 'correct horse battery', buckets),
    ).resolves.toBeTruthy()
  })

  it('a locked bucket does not lock a different account', async () => {
    const { service } = makeService(store)
    await service.register({ username: 'Bob', email: 'bob@example.com', password: 'correct horse battery' })
    for (let i = 0; i < 3; i++) {
      await service.login('alice', 'wrong', 'alice').catch(() => {})
    }
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

  it('refuses an account with an unlifted ban, and tells them the public reason', async () => {
    const acc = await store.accounts.findByUsernameLower('alice')
    const { service } = makeService(store, {}, fixedClock(), {
      findActive: async (userId) =>
        userId === acc!.id
          ? {
              id: 1,
              userId,
              reason: 'Linked to the account we banned last week.',
              publicReason: 'Posting nonsense in every thread.',
              previousPrimaryGroupId: 2,
              expiresAt: null,
              liftedAt: null,
            }
          : null,
    })

    const message = await service
      .login('alice', 'correct horse battery', 'alice')
      .then(() => '', (error: Error) => error.message)

    expect(message).toContain('Posting nonsense in every thread.')
    expect(message).not.toContain('banned last week')
  })

  it('lets a member back in once their ban is lifted', async () => {
    const { service } = makeService(store, {}, fixedClock(), {
      findActive: async () => null,
    })

    await expect(
      service.login('alice', 'correct horse battery', 'alice'),
    ).resolves.toBeTruthy()
  })

  it('upgrades a stale-cost hash on successful login, and leaves a current one alone', async () => {
    const weak = await argon2id({
      password: 'correct horse battery',
      salt: new Uint8Array(16).fill(7),
      parallelism: 1,
      iterations: 2,
      memorySize: 4096,
      hashLength: 32,
      outputType: 'encoded',
    })
    const acc = (await store.accounts.findByUsernameLower('alice'))!
    await store.accounts.updatePassword(acc.id, weak, 'argon2id')

    const { service } = makeService(store)
    await service.login('alice', 'correct horse battery', 'alice')

    const after = (await store.accounts.findByUsernameLower('alice'))!.passwordHash!
    expect(after).not.toBe(weak)
    expect(after).toContain('m=19456')

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

    await expect(service.login('alice', 'correct horse battery', 'a')).rejects.toThrow()
    await expect(service.login('alice', 'a brand new password', 'a2')).resolves.toBeTruthy()

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

    expect((await store.sessions.findByTokenHash(sessionHash))!.revokedAt).not.toBeNull()
  })

  it('invalidates an older reset token when a newer one is issued', async () => {
    const { service } = makeService(store)
    const first = await service.requestPasswordReset('alice@example.com')
    const second = await service.requestPasswordReset('alice@example.com')

    await expect(
      service.redeemPasswordReset(first.token!, 'a brand new password'),
    ).rejects.toThrow(/invalid or has expired/i)
    await expect(
      service.redeemPasswordReset(second.token!, 'a brand new password'),
    ).resolves.toBeUndefined()
  })
})

describe('activation', () => {
  let store: AccountStore

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
    expect(await service.activateAccount(token)).toBe('invalid')
  })

  it('never moves a banned account to active', async () => {
    const { service, token, account } = await registerAwaiting()

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

describe('resending a verification link', () => {
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

    expect(await service.activateAccount(registered.verificationToken!)).toBe('invalid')
    expect(await service.activateAccount(resent.token!)).toBe('activated')
  })

  it('sends nothing for an account that is already active', async () => {
    const { service } = await register('none')

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

    expect((await store.accounts.findById(account.id))!.state).toBe('awaiting_activation')
    expect((await service.resendVerification('alice@example.com')).token).toBeNull()
  })

  it('sends nothing when the board does not verify addresses at all', async () => {
    const { account } = await register('email')
    await store.accounts.setState(account.id, 'awaiting_activation')

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
    const { service } = makeService(store, { sessionLifetimeDays: 1 }, clock)
    const login = await service.login('alice', 'correct horse battery', 'alice')
    expect(await service.resolveSession(login.sessionToken)).not.toBeNull()

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

describe('ban filters block registration and login', () => {
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

  it('does not reveal a filter to someone with the wrong password', async () => {
    const filters = new MemoryBanFilters()
    const service = serviceWith(filters)
    await service.register(CREDS)
    filters.add('email', '*@spam.example')

    const attempt = () => service.login(CREDS.username, 'wrong-password', 'bucket3')

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

describe('the address ranges an account is recorded against', () => {
  const CREDS = {
    username: 'Ivan',
    email: 'ivan@example.com',
    password: 'correct horse battery',
  }
  const REGISTERED_FROM = '198.51.100.0/24'
  const SIGNED_IN_FROM = '203.0.113.0/24'

  let store: AccountStore

  beforeEach(() => {
    store = createMemoryStore()
  })

  it('keeps the registration range the caller resolved', async () => {
    const create = vi.spyOn(store.accounts, 'create')
    const { service } = makeService(store)

    await service.register(CREDS, { ipPrefix: REGISTERED_FROM })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ registrationIpPrefix: REGISTERED_FROM }),
    )
  })

  it('records the range a sign-in came from', async () => {
    const { service } = makeService(store)
    const { account } = await service.register(CREDS, { ipPrefix: REGISTERED_FROM })

    const record = vi.spyOn(store.accounts, 'recordLastIpPrefix')
    await service.login('ivan', CREDS.password, 'ivan', { ipPrefix: SIGNED_IN_FROM })

    expect(record).toHaveBeenCalledWith(account.id, SIGNED_IN_FROM)
  })

  it('records nothing when the board resolved no address', async () => {
    const { service } = makeService(store)
    const create = vi.spyOn(store.accounts, 'create')
    const record = vi.spyOn(store.accounts, 'recordLastIpPrefix')

    await service.register(CREDS)
    await service.login('ivan', CREDS.password, 'ivan')

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ registrationIpPrefix: null }),
    )
    expect(record).not.toHaveBeenCalled()
  })

  it('records nothing for a sign-in that failed', async () => {
    const { service } = makeService(store)
    await service.register(CREDS, { ipPrefix: REGISTERED_FROM })

    const record = vi.spyOn(store.accounts, 'recordLastIpPrefix')
    await expect(
      service.login('ivan', 'wrong', 'ivan', { ipPrefix: SIGNED_IN_FROM }),
    ).rejects.toThrow(ValidationError)

    expect(record).not.toHaveBeenCalled()
  })
})
