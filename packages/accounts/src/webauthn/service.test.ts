import { beforeEach, describe, expect, it } from 'vitest'

import { randomBase64Url } from '../crypto/base64url'
import { createMemoryStore } from '../memory-repos'
import type { AccountStore, AuthConfig } from '../ports'
import { IdentityService } from '../service'
import { rejectionMessage } from '../test-support.fixture'
import { createAuthenticator, type FixtureAuthenticator } from './authenticator.fixture'
import { PASSKEY_LIMIT, PasskeyService, passkeyLabel } from './service'

const PARTY = { id: 'forum.example', origin: 'https://forum.example' }
const NOW = new Date('2026-07-01T00:00:00Z')

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
  reservedUsernames: [],
  defaultMemberGroupId: 2,
}

let store: AccountStore
let userId: number

function service(): PasskeyService {
  return new PasskeyService({
    identity: new IdentityService({ store, config: CONFIG, clock: () => NOW }),
    accounts: store.accounts,
    passkeys: store.passkeys,
    identities: store.identities,
    clock: () => NOW,
  })
}

async function member(state: 'active' | 'awaiting_activation' = 'active'): Promise<number> {
  const account = await store.accounts.create({
    username: 'Ada',
    usernameLower: 'ada',
    email: 'ada@example.com',
    emailLower: 'ada@example.com',
    passwordHash: 'hash',
    passwordAlgo: 'argon2id',
    state,
    primaryGroupId: 2,
  })
  return account.id
}

async function enrol(device: FixtureAuthenticator, label = 'Laptop'): Promise<void> {
  const challenge = randomBase64Url(32)
  await service().enrol({
    userId,
    label,
    expectedChallenge: challenge,
    relyingParty: PARTY,
    response: await device.register({ challenge, origin: PARTY.origin }),
  })
}

beforeEach(async () => {
  store = createMemoryStore()
  userId = await member()
})

describe('the options a board offers', () => {
  it('names the board, the member, and every algorithm it can verify', async () => {
    const options = await service().registrationOptions({
      userId,
      challenge: 'the-challenge',
      relyingParty: PARTY,
      boardName: 'Ada’s board',
    })

    expect(options.rp).toEqual({ id: PARTY.id, name: 'Ada’s board' })
    expect(options.user.name).toBe('Ada')
    expect(options.pubKeyCredParams.map((entry) => entry.alg)).toEqual([-7, -257, -8])
    expect(options.attestation).toBe('none')
  })

  it('excludes the passkeys already on the account, so a device does not enrol twice', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)

    const options = await service().registrationOptions({
      userId,
      challenge: 'the-challenge',
      relyingParty: PARTY,
      boardName: 'Board',
    })

    expect(options.excludeCredentials.map((entry) => entry.id)).toEqual([device.credentialId])
  })

  it('refuses to offer options for an account that is gone', async () => {
    expect(
      await rejectionMessage(
        service().registrationOptions({
          userId: 9999,
          challenge: 'the-challenge',
          relyingParty: PARTY,
          boardName: 'Board',
        }),
      ),
    ).toContain('no longer exists')
  })
})

describe('enrolling', () => {
  it('stores the credential under a label of the member’s choosing', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device, '  Work   laptop ')

    const held = await store.passkeys.listForUser(userId)
    expect(held).toHaveLength(1)
    expect(held[0]?.label).toBe('Work laptop')
    expect(held[0]?.credentialId).toBe(device.credentialId)
  })

  it('names an unnamed passkey rather than storing an empty label', () => {
    expect(passkeyLabel('   ')).toBe('Passkey')
  })

  it('refuses a credential already registered here', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)

    expect(await rejectionMessage(enrol(device))).toContain('already registered')
  })

  it('will not let one account hoard passkeys without limit', async () => {
    for (let index = 0; index < PASSKEY_LIMIT; index += 1) {
      await store.passkeys.create({
        userId,
        credentialId: `cred-${index}`,
        publicKey: 'key',
        signCount: 0,
        label: 'One',
        transports: null,
        now: NOW,
      })
    }

    expect(
      await rejectionMessage(
        service().registrationOptions({
          userId,
          challenge: 'the-challenge',
          relyingParty: PARTY,
          boardName: 'Board',
        }),
      ),
    ).toContain('Remove one before adding another')
  })
})

describe('signing in', () => {
  it('starts a session and remembers the counter the device sent', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)

    const challenge = randomBase64Url(32)
    const outcome = await service().authenticate({
      credentialId: device.credentialId,
      expectedChallenge: challenge,
      relyingParty: PARTY,
      response: await device.assert({ challenge, origin: PARTY.origin, signCount: 12 }),
    })

    expect(outcome.account.id).toBe(userId)
    expect(outcome.login.sessionToken).not.toBe('')

    const stored = await store.passkeys.findByCredentialId(device.credentialId)
    expect(stored?.signCount).toBe(12)
    expect(stored?.lastUsedAt).toEqual(NOW)
  })

  it('refuses a credential this board has never seen', async () => {
    const stranger = await createAuthenticator({ rpId: PARTY.id })
    const challenge = randomBase64Url(32)

    expect(
      await rejectionMessage(
        service().authenticate({
          credentialId: stranger.credentialId,
          expectedChallenge: challenge,
          relyingParty: PARTY,
          response: await stranger.assert({ challenge, origin: PARTY.origin }),
        }),
      ),
    ).toContain('not registered on this board')
  })

  it('refuses a passkey held by an account that is not yet activated', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)
    await store.accounts.setState(userId, 'awaiting_activation')

    const challenge = randomBase64Url(32)

    expect(
      await rejectionMessage(
        service().authenticate({
          credentialId: device.credentialId,
          expectedChallenge: challenge,
          relyingParty: PARTY,
          response: await device.assert({ challenge, origin: PARTY.origin }),
        }),
      ),
    ).toContain('not yet activated')
  })

  it('refuses a passkey held by a banned account', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)
    await store.accounts.setState(userId, 'banned')

    const challenge = randomBase64Url(32)

    expect(
      await rejectionMessage(
        service().authenticate({
          credentialId: device.credentialId,
          expectedChallenge: challenge,
          relyingParty: PARTY,
          response: await device.assert({ challenge, origin: PARTY.origin }),
        }),
      ),
    ).toContain('banned')
  })
})

describe('removing a passkey', () => {
  it('removes one while a password is still there', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)
    const [held] = await store.passkeys.listForUser(userId)

    await service().remove({ userId, passkeyId: held!.id, hasPassword: true })

    expect(await store.passkeys.listForUser(userId)).toHaveLength(0)
  })

  it('refuses to remove the last way into a passwordless account', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)
    const [held] = await store.passkeys.listForUser(userId)

    expect(
      await rejectionMessage(service().remove({ userId, passkeyId: held!.id, hasPassword: false })),
    ).toContain('only way you have left to sign in')
  })

  it('allows it when a linked provider is left behind', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)
    const [held] = await store.passkeys.listForUser(userId)

    await store.identities.link({
      userId,
      provider: 'github',
      subject: 'gh-1',
      label: null,
      now: NOW,
    })

    await service().remove({
      userId,
      passkeyId: held!.id,
      hasPassword: false,
      usableProviders: ['github'],
    })

    expect(await store.passkeys.listForUser(userId)).toHaveLength(0)
  })

  it('does not count a link to a provider the board has switched off', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)
    const [held] = await store.passkeys.listForUser(userId)

    await store.identities.link({
      userId,
      provider: 'github',
      subject: 'gh-2',
      label: null,
      now: NOW,
    })

    expect(
      await rejectionMessage(
        service().remove({
          userId,
          passkeyId: held!.id,
          hasPassword: false,
          usableProviders: [],
        }),
      ),
    ).toContain('only way you have left to sign in')
  })

  it('will not remove somebody else’s passkey', async () => {
    const device = await createAuthenticator({ rpId: PARTY.id })
    await enrol(device)
    const [held] = await store.passkeys.listForUser(userId)

    expect(
      await rejectionMessage(
        service().remove({ userId: 9999, passkeyId: held!.id, hasPassword: true }),
      ),
    ).toContain('already removed')
  })
})
