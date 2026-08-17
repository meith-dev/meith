import { describe, expect, it } from 'vitest'

import { packChallenge, unpackChallenge } from './passkey-challenge'

describe('the challenge held between the two passkey requests', () => {
  it('comes back out of its own cookie', () => {
    expect(unpackChallenge(packChallenge('register', 'abc'), 'register')).toBe('abc')
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

  it('keeps a challenge that contains the separator itself', () => {
    expect(unpackChallenge('authenticate:a:b', 'authenticate')).toBe('a:b')
  })
})
