import { describe, expect, it } from 'vitest'

import { PASSKEY_CHALLENGE_TTL_MS, packChallenge, unpackChallenge } from './passkey-challenge'

const NOW = 1_787_241_600_000

describe('the challenge held between the two passkey requests', () => {
  it('comes back out of its own cookie', () => {
    expect(unpackChallenge(packChallenge('register', 'abc', {}, NOW), 'register', NOW)).toEqual({
      challenge: 'abc',
      issuedAt: NOW,
    })
  })

  it('refuses a registration challenge presented as a sign-in', () => {
    expect(
      unpackChallenge(packChallenge('register', 'abc', {}, NOW), 'authenticate', NOW),
    ).toBeNull()
    expect(
      unpackChallenge(packChallenge('authenticate', 'abc', {}, NOW), 'register', NOW),
    ).toBeNull()
  })

  it('reads nothing out of an absent or malformed cookie', () => {
    expect(unpackChallenge(undefined, 'register')).toBeNull()
    expect(unpackChallenge('', 'register')).toBeNull()
    expect(unpackChallenge('register', 'register')).toBeNull()
    expect(unpackChallenge('register:', 'register')).toBeNull()
  })

  it('keeps challenge bindings and separator characters', () => {
    const packed = packChallenge(
      'credential-proof',
      'a:b',
      { userId: 7, sessionId: 11, provedAt: 1_787_241_600_000 },
      NOW,
    )

    expect(unpackChallenge(packed, 'credential-proof', NOW)).toEqual({
      challenge: 'a:b',
      issuedAt: NOW,
      userId: 7,
      sessionId: 11,
      provedAt: 1_787_241_600_000,
    })
  })

  it('refuses a challenge older than its lifetime', () => {
    const packed = packChallenge('authenticate', 'abc', {}, NOW)
    expect(unpackChallenge(packed, 'authenticate', NOW + PASSKEY_CHALLENGE_TTL_MS)).not.toBeNull()
    expect(unpackChallenge(packed, 'authenticate', NOW + PASSKEY_CHALLENGE_TTL_MS + 1)).toBeNull()
  })

  it('refuses a cookie whose signature does not match its payload', () => {
    const packed = packChallenge('authenticate', 'abc', {}, NOW)
    const dot = packed.lastIndexOf('.')
    const sig = packed.slice(dot + 1)
    const tampered = `${packed.slice(0, dot + 1)}${sig.endsWith('A') ? 'B' : 'A'}${sig.slice(1)}`
    expect(unpackChallenge(tampered, 'authenticate', NOW)).toBeNull()
  })
})
