import { beforeAll, describe, expect, it } from 'vitest'

import { encodeBase64Url } from '../crypto/base64url'
import { rejectionMessage } from '../test-support.fixture'

import { oidcProvider } from './oidc'
import { codeChallenge } from './pkce'
import type { Fetcher } from './types'

const ISSUER = 'https://login.example.com'
const CLIENT_ID = 'board-client'
const NOW = new Date('2026-05-01T12:00:00Z')

let signingKey: CryptoKeyPair
let publicJwk: JsonWebKey

beforeAll(async () => {
  signingKey = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair

  publicJwk = await crypto.subtle.exportKey('jwk', signingKey.publicKey)
})

async function signToken(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<string> {
  const encode = (value: unknown): string =>
    encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)))

  const signed = `${encode({ alg: 'RS256', kid: 'one', ...header })}.${encode(claims)}`

  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    signingKey.privateKey,
    new TextEncoder().encode(signed),
  )

  return `${signed}.${encodeBase64Url(new Uint8Array(signature))}`
}

interface Recorded {
  readonly url: string
  readonly body: string | null
}

function fakeProvider(input: {
  readonly idToken: string
  readonly userinfo?: Record<string, unknown>
  readonly jwks?: unknown
}): { readonly fetcher: Fetcher; readonly calls: Recorded[] } {
  const calls: Recorded[] = []

  const fetcher: Fetcher = async (target, init) => {
    const url = String(target)
    calls.push({
      url,
      body: typeof init?.body === 'string' ? init.body : null,
    })

    const json = (body: unknown): Response =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })

    if (url.endsWith('/.well-known/openid-configuration')) {
      return json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        userinfo_endpoint: `${ISSUER}/userinfo`,
      })
    }
    if (url.endsWith('/jwks')) {
      return json(input.jwks ?? { keys: [{ ...publicJwk, kid: 'one', use: 'sig' }] })
    }
    if (url.endsWith('/token')) {
      return json({ id_token: input.idToken, access_token: 'at', token_type: 'Bearer' })
    }
    if (url.endsWith('/userinfo')) {
      return json(input.userinfo ?? {})
    }

    return new Response('no', { status: 404 })
  }

  return { fetcher, calls }
}

function provider(fetcher: Fetcher) {
  return oidcProvider({
    id: 'oidc',
    label: 'Acme',
    issuer: `${ISSUER}/`,
    clientId: CLIENT_ID,
    clientSecret: 'shhh',
    scopes: ['openid', 'email'],
    fetcher,
    clock: () => NOW,
  })
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: 'user-77',
    exp: Math.floor(NOW.getTime() / 1000) + 300,
    iat: Math.floor(NOW.getTime() / 1000) - 5,
    nonce: 'the-nonce',
    email: 'ada@example.com',
    email_verified: true,
    preferred_username: 'ada',
    name: 'Ada Lovelace',
    ...overrides,
  }
}

describe('the authorization request', () => {
  it('reads the endpoint out of discovery and pins the exchange to this attempt', async () => {
    const { fetcher } = fakeProvider({ idToken: await signToken(claims()) })

    const url = new URL(
      await provider(fetcher).authorizationUrl({
        redirectUri: 'https://forum.example/auth/sso/oidc/callback',
        state: 'the-state',
        nonce: 'the-nonce',
        codeVerifier: 'the-verifier',
      }),
    )

    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('scope')).toBe('openid email')
    expect(url.searchParams.get('state')).toBe('the-state')
    expect(url.searchParams.get('nonce')).toBe('the-nonce')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(await codeChallenge('the-verifier'))
  })
})

describe('the code exchange', () => {
  it('sends the verifier and reads a profile out of the identity token', async () => {
    const { fetcher, calls } = fakeProvider({ idToken: await signToken(claims()) })

    const profile = await provider(fetcher).exchange({
      code: 'the-code',
      redirectUri: 'https://forum.example/auth/sso/oidc/callback',
      nonce: 'the-nonce',
      codeVerifier: 'the-verifier',
    })

    expect(profile).toEqual({
      subject: 'user-77',
      email: 'ada@example.com',
      emailVerified: true,
      username: 'ada',
      displayName: 'Ada Lovelace',
    })

    const token = calls.find((call) => call.url.endsWith('/token'))
    expect(token?.body).toContain('code_verifier=the-verifier')
    expect(token?.body).toContain('grant_type=authorization_code')
  })

  it('fills the gaps from userinfo when the token is thin', async () => {
    const thin = await signToken({
      iss: ISSUER,
      aud: CLIENT_ID,
      sub: 'user-77',
      exp: Math.floor(NOW.getTime() / 1000) + 300,
      nonce: 'the-nonce',
    })

    const { fetcher } = fakeProvider({
      idToken: thin,
      userinfo: { email: 'grace@example.com', email_verified: true, name: 'Grace' },
    })

    const profile = await provider(fetcher).exchange({
      code: 'the-code',
      redirectUri: 'https://forum.example/auth/sso/oidc/callback',
      nonce: 'the-nonce',
      codeVerifier: 'the-verifier',
    })

    expect(profile.email).toBe('grace@example.com')
    expect(profile.emailVerified).toBe(true)
    expect(profile.displayName).toBe('Grace')
  })

  it('does not believe an unverified address', async () => {
    const { fetcher } = fakeProvider({
      idToken: await signToken(claims({ email_verified: false })),
    })

    const profile = await provider(fetcher).exchange({
      code: 'the-code',
      redirectUri: 'https://forum.example/auth/sso/oidc/callback',
      nonce: 'the-nonce',
      codeVerifier: 'the-verifier',
    })

    expect(profile.emailVerified).toBe(false)
  })
})

describe('what the exchange refuses', () => {
  async function refusal(overrides: Record<string, unknown>): Promise<string> {
    const { fetcher } = fakeProvider({ idToken: await signToken(claims(overrides)) })

    return rejectionMessage(
      provider(fetcher).exchange({
        code: 'the-code',
        redirectUri: 'https://forum.example/auth/sso/oidc/callback',
        nonce: 'the-nonce',
        codeVerifier: 'the-verifier',
      }),
    )
  }

  it('a token for a different sign-in attempt', async () => {
    expect(await refusal({ nonce: 'somebody-elses' })).toContain('different sign-in attempt')
  })

  it('a token from a different issuer', async () => {
    expect(await refusal({ iss: 'https://evil.example' })).toContain('issued by somebody else')
  })

  it('a token meant for a different client', async () => {
    expect(await refusal({ aud: 'another-board' })).toContain('meant for another board')
  })

  it('a token that has expired', async () => {
    expect(await refusal({ exp: Math.floor(NOW.getTime() / 1000) - 600 })).toContain(
      'has expired',
    )
  })

  it('a token with no subject to key an account on', async () => {
    expect(await refusal({ sub: undefined })).toContain('no stable identifier')
  })

  it('a token signed by a key the provider does not publish', async () => {
    const other = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair

    const { fetcher } = fakeProvider({
      idToken: await signToken(claims()),
      jwks: { keys: [{ ...(await crypto.subtle.exportKey('jwk', other.publicKey)), kid: 'one' }] },
    })

    expect(
      await rejectionMessage(
        provider(fetcher).exchange({
          code: 'the-code',
          redirectUri: 'https://forum.example/auth/sso/oidc/callback',
          nonce: 'the-nonce',
          codeVerifier: 'the-verifier',
        }),
      ),
    ).toContain('bad signature')
  })

  it('a token signed with an algorithm this board does not accept', async () => {
    const { fetcher } = fakeProvider({
      idToken: await signToken(claims(), { alg: 'none' }),
    })

    expect(
      await rejectionMessage(
        provider(fetcher).exchange({
          code: 'the-code',
          redirectUri: 'https://forum.example/auth/sso/oidc/callback',
          nonce: 'the-nonce',
          codeVerifier: 'the-verifier',
        }),
      ),
    ).toContain('algorithm this board does not accept')
  })
})
