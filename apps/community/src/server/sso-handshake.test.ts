import { describe, expect, it } from 'vitest'

import { newHandshake } from '@meith/accounts'

import { decodeHandshake, encodeHandshake, type Handshake } from './sso-handshake'

function handshake(overrides: Partial<Handshake> = {}): Handshake {
  return {
    provider: 'github',
    mode: 'sign-in',
    next: '/forum/general',
    authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=abc',
    ...newHandshake(),
    ...overrides,
  }
}

describe('the handshake carried across the redirect', () => {
  it('survives a round trip through a cookie value', () => {
    const original = handshake()
    expect(decodeHandshake(encodeHandshake(original))).toEqual(original)
  })

  it('is cookie-safe: no padding, no separators to escape', () => {
    expect(encodeHandshake(handshake())).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('draws a fresh state, nonce and verifier every time', () => {
    const first = newHandshake()
    const second = newHandshake()

    expect(first.state).not.toBe(second.state)
    expect(first.nonce).not.toBe(second.nonce)
    expect(first.codeVerifier).not.toBe(second.codeVerifier)
  })

  it('reads nothing out of an absent or empty cookie', () => {
    expect(decodeHandshake(undefined)).toBeNull()
    expect(decodeHandshake('')).toBeNull()
  })

  it('reads nothing out of a value that is not one of ours', () => {
    expect(decodeHandshake('not-base64url!!')).toBeNull()
    expect(decodeHandshake(encodeBody('{"provider":'))).toBeNull()
    expect(decodeHandshake(encodeBody('"a string"'))).toBeNull()
  })

  it('refuses a provider this build does not have', () => {
    expect(decodeHandshake(encodeHandshake(handshake({ provider: 'facebook' })))).toBeNull()
  })

  it('refuses a mode it does not know', () => {
    expect(
      decodeHandshake(
        encodeHandshake(handshake({ mode: 'elevate' as Handshake['mode'] })),
      ),
    ).toBeNull()
  })

  it('refuses one with nothing to check the callback against', () => {
    expect(decodeHandshake(encodeHandshake(handshake({ state: '' })))).toBeNull()
    expect(decodeHandshake(encodeHandshake(handshake({ nonce: '' })))).toBeNull()
    expect(decodeHandshake(encodeHandshake(handshake({ codeVerifier: '' })))).toBeNull()
  })

  it('sends an off-site return target home instead', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '']) {
      expect(decodeHandshake(encodeHandshake(handshake({ next })))?.next).toBe('/')
    }
  })

  it('keeps a return target on this board', () => {
    expect(decodeHandshake(encodeHandshake(handshake({ next: '/usercp' })))?.next).toBe(
      '/usercp',
    )
  })

  it('refuses a hand-off target that is not an address a provider could live at', () => {
    for (const authorizationUrl of ['', 'javascript:alert(1)', '/login', 'not a url']) {
      expect(decodeHandshake(encodeHandshake(handshake({ authorizationUrl })))).toBeNull()
    }
  })
})

function encodeBody(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64url')
}
