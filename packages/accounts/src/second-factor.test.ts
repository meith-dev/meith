import { beforeEach, describe, expect, it } from 'vitest'

import { MemoryBanFilters } from './memory-bans'
import { createMemoryStore } from './memory-repos'
import type { AccountStore, AuthConfig } from './ports'
import { IdentityService, SECOND_FACTOR_TTL_MINUTES } from './service'
import { rejectionMessage } from './test-support.fixture'
import { TwoFactorService } from './totp/service'
import { stepAt, totpCode } from './totp/totp'

const CONFIG: AuthConfig = {
  registrationEnabled: true,
  minPasswordLength: 8,
  usernameMin: 3,
  usernameMax: 20,
  activationMethod: 'none',
  maxLoginAttempts: 5,
  maxAccountLoginAttempts: 0,
  lockoutMinutes: 15,
  sessionLifetimeDays: 30,
  resetTokenTtlMinutes: 60,
  reservedUsernames: [],
  defaultMemberGroupId: 2,
}

const PASSWORD = 'correct horse battery'
const KEY = 'a-board-auth-secret-0000000000000'

let store: AccountStore
let now: Date
let userId: number

function twoFactor(): TwoFactorService {
  return new TwoFactorService({
    accounts: store.accounts,
    twoFactor: store.twoFactor,
    recoveryCodes: store.recoveryCodes,
    sealingKey: KEY,
    clock: () => now,
  })
}

function identity(): IdentityService {
  return new IdentityService({
    store,
    config: CONFIG,
    clock: () => now,
    secondFactor: twoFactor(),
    banFilters: new MemoryBanFilters(),
  })
}

async function enrol(): Promise<string> {
  const { secret } = await twoFactor().beginEnrolment(userId, 'Board')
  await twoFactor().confirmEnrolment({ userId, code: await totpCode(secret, stepAt(now)) })
  return secret
}

beforeEach(async () => {
  store = createMemoryStore()
  now = new Date('2026-08-01T12:00:00Z')

  const registered = await identity().register({
    username: 'alice',
    email: 'alice@example.com',
    password: PASSWORD,
  })
  userId = registered.account.id
})

describe('an account with nothing beyond a password', () => {
  it('signs straight in', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')

    expect(outcome.status).toBe('signed-in')
    if (outcome.status !== 'signed-in') return
    expect(outcome.login.sessionToken).not.toBe('')
  })
})

describe('an account that asks for a code', () => {
  beforeEach(async () => {
    await enrol()
  })

  it('holds the sign-in rather than handing over a session', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')

    expect(outcome.status).toBe('second-factor')
    if (outcome.status !== 'second-factor') return

    expect(outcome.account.id).toBe(userId)
    expect(outcome.token).not.toBe('')
    expect(outcome.expiresAt).toEqual(new Date(now.getTime() + SECOND_FACTOR_TTL_MINUTES * 60_000))
    expect(await store.sessions.listActiveForUser(userId, now)).toHaveLength(0)
  })

  it('still refuses the wrong password, before any of that', async () => {
    expect(
      await rejectionMessage(identity().login('alice', 'not the password', 'alice')),
    ).toContain('Incorrect username or password')
  })

  it('says who the hold belongs to without spending it', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')
    if (outcome.status !== 'second-factor') throw new Error('expected a hold')

    expect(await identity().pendingSecondFactor(outcome.token)).toEqual({
      userId,
      remember: false,
    })
    expect(await identity().pendingSecondFactor(outcome.token)).not.toBeNull()
  })

  it('carries the member’s "keep me signed in" choice across the two steps', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice', {}, { remember: true })
    if (outcome.status !== 'second-factor') throw new Error('expected a hold')

    expect((await identity().pendingSecondFactor(outcome.token))?.remember).toBe(true)
  })

  it('turns the hold into a session, once', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')
    if (outcome.status !== 'second-factor') throw new Error('expected a hold')

    const login = await identity().redeemSecondFactor(outcome.token)
    expect(login.account.id).toBe(userId)
    expect(await identity().resolveSession(login.sessionToken)).toEqual({ userId })

    expect(await rejectionMessage(identity().redeemSecondFactor(outcome.token))).toContain(
      'took too long to finish',
    )
  })

  it('lets the hold expire', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')
    if (outcome.status !== 'second-factor') throw new Error('expected a hold')

    now = new Date(now.getTime() + (SECOND_FACTOR_TTL_MINUTES + 1) * 60_000)

    expect(await identity().pendingSecondFactor(outcome.token)).toBeNull()
    expect(await rejectionMessage(identity().redeemSecondFactor(outcome.token))).toContain(
      'took too long to finish',
    )
  })

  it('refuses a hold nobody issued', async () => {
    expect(await rejectionMessage(identity().redeemSecondFactor('not-a-real-token'))).toContain(
      'took too long to finish',
    )
  })

  it('drops the earlier hold when the password is given again', async () => {
    const first = await identity().login('alice', PASSWORD, 'alice')
    const second = await identity().login('alice', PASSWORD, 'alice')
    if (first.status !== 'second-factor' || second.status !== 'second-factor') {
      throw new Error('expected two holds')
    }

    expect(await identity().pendingSecondFactor(first.token)).toBeNull()
    expect(await identity().pendingSecondFactor(second.token)).not.toBeNull()
  })

  it('refuses to finish for an account banned between the two steps', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')
    if (outcome.status !== 'second-factor') throw new Error('expected a hold')

    await store.accounts.setState(userId, 'banned')

    expect(await rejectionMessage(identity().redeemSecondFactor(outcome.token))).toContain('banned')
  })

  it('abandons a hold outright, which is what signing out of the half-step does', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')
    if (outcome.status !== 'second-factor') throw new Error('expected a hold')

    await identity().abandonSecondFactor(userId)

    expect(await identity().pendingSecondFactor(outcome.token)).toBeNull()
  })

  it('records the device the session was started from', async () => {
    const outcome = await identity().login('alice', PASSWORD, 'alice')
    if (outcome.status !== 'second-factor') throw new Error('expected a hold')

    await identity().redeemSecondFactor(outcome.token, {
      ipPrefix: '203.0.113.0',
      userAgent: 'Mozilla/5.0',
    })

    const [session] = await store.sessions.listActiveForUser(userId, now)
    expect(session?.ipPrefix).toBe('203.0.113.0')
    expect(session?.userAgent).toBe('Mozilla/5.0')
  })
})

describe('turning the code off again', () => {
  it('puts the account back to signing straight in', async () => {
    await enrol()
    await twoFactor().disable({ userId, required: false })

    expect((await identity().login('alice', PASSWORD, 'alice')).status).toBe('signed-in')
  })
})
