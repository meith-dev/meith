import { describe, expect, it } from 'vitest'

import { packChallenge, unpackChallenge } from './passkey-challenge'

describe('the challenge held between the two passkey requests', () => {
  it('comes back out of its own cookie', () => {
    expect(unpackChallenge(packChallenge('register', 'abc'), 'register')).toEqual({
      challenge: 'abc',
    })
  })

  it('refuses a registration challenge presented as a sign-in', () => {
    expect(unpackChallenge(packChallenge('register', 'abc'), 'authenticate')).toBeNull()
    expect(unpackChallenge(packChallenge('authenticate', 'abc'), 'register')).toBeNull()
  })

  it('reads nothing out of an absent or malformed cookie', () => {
    expect(unpackChallenge(undefined, 'register')).toBeNull()
    expect(unpackChallenge('', 'register')).toBeNull()
    expect(unpackChallenge('register', 'register')).toBeNull()
    expect(unpackChallenge('register:', 'register')).toBeNull()
  })

  it('keeps challenge bindings and separator characters', () => {
    const packed = packChallenge('credential-proof', 'a:b', {
      userId: 7,
      sessionId: 11,
      provedAt: 1_787_241_600_000,
    })

    expect(unpackChallenge(packed, 'credential-proof')).toEqual({
      challenge: 'a:b',
      userId: 7,
      sessionId: 11,
      provedAt: 1_787_241_600_000,
    })
  })
})
