import { beforeEach, describe, expect, it } from 'vitest'

import { MemoryBanFilters } from '../memory-bans'
import { createMemoryStore } from '../memory-repos'
import type { AccountStore, AuthConfig } from '../ports'
import { IdentityService } from '../service'
import { rejectionMessage } from '../test-support.fixture'
import { FederationService } from './service'
import type { IdentityProvider, ProviderProfile } from './types'

const CONFIG: AuthConfig = {
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

const NOW = new Date('2026-06-01T00:00:00Z')

const PROVIDER: IdentityProvider = {
  id: 'github',
  label: 'GitHub',
  authorizationUrl: async () => 'https://github.com/login/oauth/authorize',
  exchange: async () => {
    throw new Error('not used')
  },
}

function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    subject: 'gh-1',
    email: 'ada@example.com',
    emailVerified: true,
    username: 'ada',
    displayName: 'Ada Lovelace',
    ...overrides,
  }
}

let store: AccountStore

function build(overrides: Partial<AuthConfig> = {}): FederationService {
  const identity = new IdentityService({
    store,
    config: { ...CONFIG, ...overrides },
    clock: () => NOW,
    banFilters: new MemoryBanFilters(),
  })

  return new FederationService({
    identity,
    accounts: store.accounts,
    identities: store.identities,
    clock: () => NOW,
  })
}

async function existingMember(email: string, username = 'ada'): Promise<number> {
  const account = await store.accounts.create({
    username,
    usernameLower: username.toLowerCase(),
    email,
    emailLower: email.toLowerCase(),
    passwordHash: 'hash',
    passwordAlgo: 'argon2id',
    state: 'active',
    primaryGroupId: 2,
  })
  return account.id
}

beforeEach(() => {
  store = createMemoryStore()
})

describe('a first federated sign-in', () => {
  it('registers an account, links the identity and signs the member in', async () => {
    const outcome = await build().completeSignIn({ provider: PROVIDER, profile: profile() })

    expect(outcome.status).toBe('signed-in')
    if (outcome.status !== 'signed-in') return

    expect(outcome.created).toBe(true)
    expect(outcome.account.username).toBe('ada')
    expect(outcome.account.email).toBe('ada@example.com')
    expect(outcome.account.passwordHash).toBeNull()
    expect(outcome.login.sessionToken).not.toBe('')

    const linked = await store.identities.findBySubject('github', 'gh-1')
    expect(linked?.userId).toBe(outcome.account.id)
    expect(linked?.label).toBe('ada')
  })

  it('picks a free username when the obvious one is taken', async () => {
    await existingMember('someone@example.com', 'ada')

    const outcome = await build().completeSignIn({
      provider: PROVIDER,
      profile: profile({ email: 'ada2@example.com' }),
    })

    expect(outcome.status === 'signed-in' && outcome.account.username).toBe('ada2')
  })

  it('will not take a reserved username, however the provider spells it', async () => {
    const outcome = await build().completeSignIn({
      provider: PROVIDER,
      profile: profile({ username: 'Admin', email: 'root@example.com' }),
    })

    expect(outcome.status === 'signed-in' && outcome.account.username).toBe('Admin2')
  })

  it('builds a username out of the address when the provider offers no name', async () => {
    const outcome = await build().completeSignIn({
      provider: PROVIDER,
      profile: profile({ username: null, displayName: null, email: 'grace.h@example.com' }),
    })

    expect(outcome.status === 'signed-in' && outcome.account.username).toBe('grace.h')
  })

  it('strips what a username may not contain rather than refusing the sign-in', async () => {
    const outcome = await build().completeSignIn({
      provider: PROVIDER,
      profile: profile({ username: '@ada/lovelace!' }),
    })

    expect(outcome.status === 'signed-in' && outcome.account.username).toBe('adalovelace')
  })

  it('falls back to a plain name when nothing usable survives the strip', async () => {
    const outcome = await build().completeSignIn({
      provider: PROVIDER,
      profile: profile({ username: '!!!', displayName: '???', email: '!!!@example.com' }),
    })

    expect(outcome.status === 'signed-in' && outcome.account.username).toBe('member')
  })

  it('refuses when the board is closed to new members', async () => {
    expect(
      await rejectionMessage(
        build({ registrationEnabled: false }).completeSignIn({
          provider: PROVIDER,
          profile: profile(),
        }),
      ),
    ).toContain('not taking new members')
  })

  it('refuses when the provider shared no address to register against', async () => {
    expect(
      await rejectionMessage(
        build().completeSignIn({ provider: PROVIDER, profile: profile({ email: null }) }),
      ),
    ).toContain('did not share a confirmed e-mail address')
  })

  it('lets the board refuse the registration before the account exists', async () => {
    const refused = build().completeSignIn({
      provider: PROVIDER,
      profile: profile(),
      beforeProvision: async () => {
        throw new Error('too many from this address')
      },
    })

    expect(await rejectionMessage(refused)).toBe('too many from this address')
    expect(await store.accounts.findByEmailLower('ada@example.com')).toBeNull()
  })
})

describe('the approval posture a first sign-in meets', () => {
  it('holds the account when an administrator approves new members', async () => {
    const outcome = await build({ activationMethod: 'admin' }).completeSignIn({
      provider: PROVIDER,
      profile: profile(),
    })

    expect(outcome.status).toBe('pending')
    if (outcome.status !== 'pending') return

    expect(outcome.account.state).toBe('awaiting_activation')
    expect(outcome.verificationToken).toBeNull()
  })

  it('takes the provider’s confirmed address as the confirmation the board wanted', async () => {
    const outcome = await build({ activationMethod: 'email' }).completeSignIn({
      provider: PROVIDER,
      profile: profile(),
    })

    expect(outcome.status).toBe('signed-in')
    if (outcome.status !== 'signed-in') return
    expect(outcome.account.state).toBe('active')
    expect(outcome.account.emailVerifiedAt).toEqual(NOW)
  })

  it('sends its own confirmation when the provider will not vouch for the address', async () => {
    const outcome = await build({ activationMethod: 'email' }).completeSignIn({
      provider: PROVIDER,
      profile: profile({ emailVerified: false }),
    })

    expect(outcome.status).toBe('pending')
    if (outcome.status !== 'pending') return
    expect(outcome.verificationToken).not.toBeNull()
    expect(outcome.account.state).toBe('awaiting_activation')
  })

  it('still waits for an administrator when both are asked for', async () => {
    const outcome = await build({ activationMethod: 'both' }).completeSignIn({
      provider: PROVIDER,
      profile: profile(),
    })

    expect(outcome.status).toBe('pending')
    if (outcome.status !== 'pending') return
    expect(outcome.account.state).toBe('awaiting_activation')
    expect(outcome.account.emailVerifiedAt).toEqual(NOW)
  })
})

describe('meeting an account that already exists', () => {
  it('links it when the provider has confirmed the same address', async () => {
    const userId = await existingMember('ada@example.com')

    const outcome = await build().completeSignIn({ provider: PROVIDER, profile: profile() })

    expect(outcome.status === 'signed-in' && outcome.account.id).toBe(userId)
    expect(outcome.status === 'signed-in' && outcome.created).toBe(false)
    expect((await store.identities.findBySubject('github', 'gh-1'))?.userId).toBe(userId)
  })

  it('refuses to take an account over on an address nobody confirmed', async () => {
    await existingMember('ada@example.com')

    expect(
      await rejectionMessage(
        build().completeSignIn({
          provider: PROVIDER,
          profile: profile({ emailVerified: false }),
        }),
      ),
    ).toContain('has not confirmed it belongs to you')

    expect(await store.identities.findBySubject('github', 'gh-1')).toBeNull()
  })

  it('signs the linked member in again without touching the account', async () => {
    const first = await build().completeSignIn({ provider: PROVIDER, profile: profile() })
    const second = await build().completeSignIn({
      provider: PROVIDER,
      profile: profile({ username: 'renamed' }),
    })

    expect(second.status === 'signed-in' && second.account.id).toBe(
      first.status === 'signed-in' ? first.account.id : -1,
    )
    expect(second.status === 'signed-in' && second.created).toBe(false)
    expect((await store.identities.findBySubject('github', 'gh-1'))?.lastUsedAt).toEqual(NOW)
  })

  it('refuses a banned member however they arrive', async () => {
    const userId = await existingMember('ada@example.com')
    await store.accounts.setState(userId, 'banned')

    expect(
      await rejectionMessage(build().completeSignIn({ provider: PROVIDER, profile: profile() })),
    ).toContain('banned')
  })
})

describe('linking from an account already signed in', () => {
  it('adds a second provider to the same account', async () => {
    const userId = await existingMember('ada@example.com')

    await build().linkToViewer({ userId, provider: PROVIDER, profile: profile() })
    await build().linkToViewer({
      userId,
      provider: { ...PROVIDER, id: 'google', label: 'Google' },
      profile: profile({ subject: 'goog-1' }),
    })

    expect(await store.identities.listForUser(userId)).toHaveLength(2)
  })

  it('refuses an identity another member already holds', async () => {
    const owner = await existingMember('ada@example.com')
    const other = await existingMember('grace@example.com', 'grace')

    await build().linkToViewer({ userId: owner, provider: PROVIDER, profile: profile() })

    expect(
      await rejectionMessage(
        build().linkToViewer({ userId: other, provider: PROVIDER, profile: profile() }),
      ),
    ).toContain('already linked to another member')
  })

  it('is quiet about linking the same identity twice', async () => {
    const userId = await existingMember('ada@example.com')

    const first = await build().linkToViewer({ userId, provider: PROVIDER, profile: profile() })
    const again = await build().linkToViewer({ userId, provider: PROVIDER, profile: profile() })

    expect(again.id).toBe(first.id)
    expect(await store.identities.listForUser(userId)).toHaveLength(1)
  })
})

describe('unlinking', () => {
  it('removes a link when a password is still there to sign in with', async () => {
    const userId = await existingMember('ada@example.com')
    const identity = await build().linkToViewer({
      userId,
      provider: PROVIDER,
      profile: profile(),
    })

    await build().unlink({
      userId,
      identityId: identity.id,
      hasPassword: true,
      usablePasskeys: 0,
      usableProviders: ['github'],
    })

    expect(await store.identities.listForUser(userId)).toHaveLength(0)
  })

  it('refuses to remove the last way into a passwordless account', async () => {
    const outcome = await build().completeSignIn({ provider: PROVIDER, profile: profile() })
    const userId = outcome.status === 'signed-in' ? outcome.account.id : 0
    const [identity] = await store.identities.listForUser(userId)

    expect(
      await rejectionMessage(
        build().unlink({
          userId,
          identityId: identity!.id,
          hasPassword: false,
          usablePasskeys: 0,
          usableProviders: ['github'],
        }),
      ),
    ).toContain('only way you have left to sign in')

    expect(await store.identities.listForUser(userId)).toHaveLength(1)
  })

  it('allows it when a passkey is left behind', async () => {
    const outcome = await build().completeSignIn({ provider: PROVIDER, profile: profile() })
    const userId = outcome.status === 'signed-in' ? outcome.account.id : 0
    const [identity] = await store.identities.listForUser(userId)

    await build().unlink({
      userId,
      identityId: identity!.id,
      hasPassword: false,
      usablePasskeys: 1,
      usableProviders: ['github'],
    })

    expect(await store.identities.listForUser(userId)).toHaveLength(0)
  })

  it('does not count a link to a provider the board has switched off', async () => {
    const outcome = await build().completeSignIn({ provider: PROVIDER, profile: profile() })
    const userId = outcome.status === 'signed-in' ? outcome.account.id : 0

    await build().linkToViewer({
      userId,
      provider: { ...PROVIDER, id: 'google', label: 'Google' },
      profile: profile({ subject: 'goog-1' }),
    })

    const [identity] = await store.identities.listForUser(userId)

    expect(
      await rejectionMessage(
        build().unlink({
          userId,
          identityId: identity!.id,
          hasPassword: false,
          usablePasskeys: 0,
          usableProviders: ['github'],
        }),
      ),
    ).toContain('only way you have left to sign in')
  })
})
