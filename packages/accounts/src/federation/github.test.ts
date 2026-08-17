import { describe, expect, it } from 'vitest'

import { rejectionMessage } from '../test-support.fixture'

import { githubProvider } from './github'
import type { Fetcher } from './types'

interface Responses {
  readonly token?: unknown
  readonly user?: unknown
  readonly emails?: unknown
  readonly emailStatus?: number
}

function fakeGithub(responses: Responses): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = []

  const fetcher: Fetcher = async (target) => {
    const url = String(target)
    calls.push(url)

    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    if (url.includes('/login/oauth/access_token')) {
      return json(responses.token ?? { access_token: 'gho_token' })
    }
    if (url.endsWith('/user/emails')) {
      return json(responses.emails ?? [], responses.emailStatus ?? 200)
    }
    if (url.endsWith('/user')) {
      return json(responses.user ?? { id: 991, login: 'ada', name: 'Ada' })
    }
    return new Response('no', { status: 404 })
  }

  return { fetcher, calls }
}

function provider(fetcher: Fetcher) {
  return githubProvider({ clientId: 'id', clientSecret: 'secret', fetcher })
}

const HANDSHAKE = {
  code: 'the-code',
  redirectUri: 'https://forum.example/auth/sso/github/callback',
  nonce: 'nonce',
  codeVerifier: 'verifier',
}

describe('the GitHub authorization request', () => {
  it('carries the state and does not invite a new GitHub account', async () => {
    const { fetcher } = fakeGithub({})

    const url = new URL(
      await provider(fetcher).authorizationUrl({
        redirectUri: HANDSHAKE.redirectUri,
        state: 'the-state',
        nonce: 'nonce',
        codeVerifier: 'verifier',
      }),
    )

    expect(url.host).toBe('github.com')
    expect(url.searchParams.get('state')).toBe('the-state')
    expect(url.searchParams.get('scope')).toBe('read:user user:email')
    expect(url.searchParams.get('allow_signup')).toBe('false')
  })
})

describe('the GitHub exchange', () => {
  it('prefers the primary verified address', async () => {
    const { fetcher } = fakeGithub({
      emails: [
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'ada@example.com', primary: true, verified: true },
      ],
    })

    expect(await provider(fetcher).exchange(HANDSHAKE)).toEqual({
      subject: '991',
      email: 'ada@example.com',
      emailVerified: true,
      username: 'ada',
      displayName: 'Ada',
    })
  })

  it('takes a verified address that is not the primary one over none at all', async () => {
    const { fetcher } = fakeGithub({
      emails: [
        { email: 'unconfirmed@example.com', primary: true, verified: false },
        { email: 'ada@example.com', primary: false, verified: true },
      ],
    })

    const profile = await provider(fetcher).exchange(HANDSHAKE)
    expect(profile.email).toBe('ada@example.com')
    expect(profile.emailVerified).toBe(true)
  })

  it('does not claim an address is confirmed when the scope was refused', async () => {
    const { fetcher } = fakeGithub({
      emailStatus: 403,
      user: { id: 991, login: 'ada', name: 'Ada', email: 'public@example.com' },
    })

    const profile = await provider(fetcher).exchange(HANDSHAKE)
    expect(profile.email).toBe('public@example.com')
    expect(profile.emailVerified).toBe(false)
  })

  it('keeps the numeric id as the subject, not the login somebody can change', async () => {
    const { fetcher } = fakeGithub({ user: { id: 42, login: 'ada' } })
    expect((await provider(fetcher).exchange(HANDSHAKE)).subject).toBe('42')
  })

  it('refuses an exchange GitHub would not grant a token for', async () => {
    const { fetcher } = fakeGithub({ token: { error: 'bad_verification_code' } })

    expect(await rejectionMessage(provider(fetcher).exchange(HANDSHAKE))).toContain(
      'refused the sign-in code',
    )
  })

  it('refuses an account with no identifier to key on', async () => {
    const { fetcher } = fakeGithub({ user: { login: 'ada' } })

    expect(await rejectionMessage(provider(fetcher).exchange(HANDSHAKE))).toContain(
      'no stable identifier',
    )
  })
})
