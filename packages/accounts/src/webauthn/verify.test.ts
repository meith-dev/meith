import { beforeAll, describe, expect, it } from 'vitest'

import { randomBase64Url } from '../crypto/base64url'
import { rejectionMessage } from '../test-support.fixture'

import { createAuthenticator, type FixtureAuthenticator } from './authenticator.fixture'
import { verifyAssertion, verifyRegistration } from './verify'

const PARTY = { id: 'forum.example', origin: 'https://forum.example' }

let device: FixtureAuthenticator
let rsaDevice: FixtureAuthenticator
let edDevice: FixtureAuthenticator

beforeAll(async () => {
  device = await createAuthenticator({ rpId: PARTY.id })
  rsaDevice = await createAuthenticator({ rpId: PARTY.id, algorithm: 'RS256' })
  edDevice = await createAuthenticator({ rpId: PARTY.id, algorithm: 'EdDSA' })
})

describe('registering a passkey', () => {
  it('takes the credential and its key out of the attestation', async () => {
    const challenge = randomBase64Url(32)

    const registered = await verifyRegistration({
      response: await device.register({ challenge, origin: PARTY.origin }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
    })

    expect(registered.credentialId).toBe(device.credentialId)
    expect(registered.publicKey).toBe(device.publicKey)
    expect(registered.userVerified).toBe(true)
    expect(registered.signCount).toBe(0)
  })

  it('reads an RSA credential too', async () => {
    const challenge = randomBase64Url(32)

    const registered = await verifyRegistration({
      response: await rsaDevice.register({ challenge, origin: PARTY.origin }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
    })

    expect(registered.publicKey).toBe(rsaDevice.publicKey)
  })

  it('reads an Ed25519 credential too', async () => {
    const challenge = randomBase64Url(32)

    const registered = await verifyRegistration({
      response: await edDevice.register({ challenge, origin: PARTY.origin }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
    })

    expect(registered.publicKey).toBe(edDevice.publicKey)
  })

  it('refuses a response to a challenge the board did not set', async () => {
    const registration = verifyRegistration({
      response: await device.register({
        challenge: randomBase64Url(32),
        origin: PARTY.origin,
      }),
      expectedChallenge: randomBase64Url(32),
      relyingParty: PARTY,
    })

    expect(await rejectionMessage(registration)).toContain('expired or was started somewhere else')
  })

  it('refuses a response collected on another site', async () => {
    const challenge = randomBase64Url(32)

    const registration = verifyRegistration({
      response: await device.register({ challenge, origin: 'https://evil.example' }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
    })

    expect(await rejectionMessage(registration)).toContain('different address')
  })

  it('refuses a credential scoped to another relying party', async () => {
    const challenge = randomBase64Url(32)

    const registration = verifyRegistration({
      response: await device.register({
        challenge,
        origin: PARTY.origin,
        rpId: 'other.example',
      }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
    })

    expect(await rejectionMessage(registration)).toContain('different site')
  })

  it('refuses one the member never touched the device for', async () => {
    const challenge = randomBase64Url(32)

    const registration = verifyRegistration({
      response: await device.register({
        challenge,
        origin: PARTY.origin,
        flags: 0b0100_0000,
      }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
    })

    expect(await rejectionMessage(registration)).toContain('not confirmed on the device')
  })

  it('refuses an assertion presented as a registration', async () => {
    const challenge = randomBase64Url(32)

    const registration = verifyRegistration({
      response: await device.register({
        challenge,
        origin: PARTY.origin,
        type: 'webauthn.get',
      }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
    })

    expect(await rejectionMessage(registration)).toContain('could not be verified')
  })
})

describe('signing in with a passkey', () => {
  it('accepts a signature the registered key made', async () => {
    const challenge = randomBase64Url(32)

    const verified = await verifyAssertion({
      response: await device.assert({ challenge, origin: PARTY.origin, signCount: 9 }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: device.publicKey,
      storedSignCount: 3,
    })

    expect(verified.signCount).toBe(9)
  })

  it('accepts an RSA signature', async () => {
    const challenge = randomBase64Url(32)

    const verified = await verifyAssertion({
      response: await rsaDevice.assert({ challenge, origin: PARTY.origin, signCount: 2 }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: rsaDevice.publicKey,
      storedSignCount: 1,
    })

    expect(verified.signCount).toBe(2)
  })

  it('accepts an Ed25519 signature', async () => {
    const challenge = randomBase64Url(32)

    const verified = await verifyAssertion({
      response: await edDevice.assert({ challenge, origin: PARTY.origin, signCount: 5 }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: edDevice.publicKey,
      storedSignCount: 4,
    })

    expect(verified.signCount).toBe(5)
  })

  it('refuses a signature that has been altered', async () => {
    const challenge = randomBase64Url(32)

    const assertion = verifyAssertion({
      response: await device.assert({ challenge, origin: PARTY.origin, tamper: true }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: device.publicKey,
      storedSignCount: 0,
    })

    expect(await rejectionMessage(assertion)).toContain('could not be verified')
  })

  it('refuses a signature from a key the board does not hold', async () => {
    const challenge = randomBase64Url(32)
    const other = await createAuthenticator({ rpId: PARTY.id })

    const assertion = verifyAssertion({
      response: await other.assert({ challenge, origin: PARTY.origin }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: device.publicKey,
      storedSignCount: 0,
    })

    expect(await rejectionMessage(assertion)).toContain('could not be verified')
  })

  it('refuses a replay of a counter it has already seen', async () => {
    const challenge = randomBase64Url(32)

    const assertion = verifyAssertion({
      response: await device.assert({ challenge, origin: PARTY.origin, signCount: 4 }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: device.publicKey,
      storedSignCount: 4,
    })

    expect(await rejectionMessage(assertion)).toContain('already seen')
  })

  it('accepts a device that keeps no counter at all', async () => {
    const challenge = randomBase64Url(32)

    const verified = await verifyAssertion({
      response: await device.assert({ challenge, origin: PARTY.origin, signCount: 0 }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: device.publicKey,
      storedSignCount: 0,
    })

    expect(verified.signCount).toBe(0)
  })

  it('refuses one collected against another address', async () => {
    const challenge = randomBase64Url(32)

    const assertion = verifyAssertion({
      response: await device.assert({ challenge, origin: 'https://evil.example' }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: device.publicKey,
      storedSignCount: 0,
    })

    expect(await rejectionMessage(assertion)).toContain('different address')
  })

  it('refuses a registration presented as an assertion', async () => {
    const challenge = randomBase64Url(32)

    const assertion = verifyAssertion({
      response: await device.assert({
        challenge,
        origin: PARTY.origin,
        type: 'webauthn.create',
      }),
      expectedChallenge: challenge,
      relyingParty: PARTY,
      publicKey: device.publicKey,
      storedSignCount: 0,
    })

    expect(await rejectionMessage(assertion)).toContain('could not be verified')
  })
})
