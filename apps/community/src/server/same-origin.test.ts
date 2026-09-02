import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

import { isSameOrigin, isTopLevelNavigation } from './same-origin'

function post(headers: Record<string, string>): Request {
  return new Request('https://board.example/api/read/all', { method: 'POST', headers })
}

describe('isSameOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetEnvForTests()
  })

  it('admits the board’s own origin', () => {
    expect(isSameOrigin(post({ host: 'board.example', origin: 'https://board.example' }))).toBe(
      true,
    )
  })

  it('refuses another origin on the same host name', () => {
    expect(
      isSameOrigin(post({ host: 'board.example', origin: 'https://evil.board.example' })),
    ).toBe(false)
  })

  it('compares against the forwarded host when a proxy rewrote it', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1')
    resetEnvForTests()

    expect(
      isSameOrigin(
        post({
          host: 'internal:3000',
          'x-forwarded-host': 'board.example',
          origin: 'https://board.example',
        }),
      ),
    ).toBe(true)
  })

  it('refuses a request that names no origin and no fetch metadata', () => {
    expect(isSameOrigin(post({ host: 'board.example' }))).toBe(false)
  })

  it('refuses an opaque origin with nothing to corroborate it', () => {
    expect(isSameOrigin(post({ host: 'board.example', origin: 'null' }))).toBe(false)
  })

  it('falls back to Sec-Fetch-Site when there is no origin', () => {
    expect(isSameOrigin(post({ host: 'board.example', 'sec-fetch-site': 'same-origin' }))).toBe(
      true,
    )
    expect(isSameOrigin(post({ host: 'board.example', 'sec-fetch-site': 'same-site' }))).toBe(false)
    expect(isSameOrigin(post({ host: 'board.example', 'sec-fetch-site': 'cross-site' }))).toBe(
      false,
    )
  })

  it('refuses a mismatched origin however friendly the fetch metadata is', () => {
    expect(
      isSameOrigin(
        post({
          host: 'board.example',
          origin: 'https://elsewhere.example',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(false)
  })

  it('refuses a garbled origin', () => {
    expect(isSameOrigin(post({ host: 'board.example', origin: 'not a url' }))).toBe(false)
  })
})

describe('isSameOrigin with a configured board origin', () => {
  afterEach(() => {
    delete process.env.APP_URL
    delete process.env.TRUSTED_PROXY_HOPS
    resetEnvForTests()
  })

  function withEnv(vars: Record<string, string>): void {
    for (const [name, value] of Object.entries(vars)) process.env[name] = value
    resetEnvForTests()
  }

  it('trusts APP_URL over any forwarded host header', () => {
    withEnv({ APP_URL: 'https://board.example' })
    expect(
      isSameOrigin(
        post({
          host: 'internal:3000',
          'x-forwarded-host': 'attacker.example',
          origin: 'https://board.example',
        }),
      ),
    ).toBe(true)
  })

  it('refuses a sibling origin even when the forwarded host names it', () => {
    withEnv({ APP_URL: 'https://board.example' })
    expect(
      isSameOrigin(
        post({
          host: 'board.example',
          'x-forwarded-host': 'evil.board.example',
          origin: 'https://evil.board.example',
        }),
      ),
    ).toBe(false)
  })

  it('refuses a cross-scheme origin on the configured host', () => {
    withEnv({ APP_URL: 'https://board.example' })
    expect(isSameOrigin(post({ host: 'board.example', origin: 'http://board.example' }))).toBe(
      false,
    )
  })

  it('refuses a different port on the configured host', () => {
    withEnv({ APP_URL: 'https://board.example' })
    expect(
      isSameOrigin(post({ host: 'board.example', origin: 'https://board.example:8443' })),
    ).toBe(false)
  })

  it('ignores the forwarded host when no proxy hop is trusted', () => {
    withEnv({ TRUSTED_PROXY_HOPS: '0' })
    expect(
      isSameOrigin(
        post({
          host: 'internal:3000',
          'x-forwarded-host': 'board.example',
          origin: 'https://board.example',
        }),
      ),
    ).toBe(false)
    expect(
      isSameOrigin(
        post({
          host: 'internal:3000',
          'x-forwarded-host': 'board.example',
          origin: 'https://internal:3000',
        }),
      ),
    ).toBe(true)
  })
})

describe('isTopLevelNavigation', () => {
  function get(headers: Record<string, string>): Request {
    return new Request('https://board.example/auth/resume', { headers })
  }

  it('recognises a document navigation', () => {
    expect(
      isTopLevelNavigation(get({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })),
    ).toBe(true)
  })

  it('refuses a subresource however it is fetched', () => {
    expect(
      isTopLevelNavigation(get({ 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' })),
    ).toBe(false)
    expect(isTopLevelNavigation(get({ 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }))).toBe(
      false,
    )
    expect(
      isTopLevelNavigation(get({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' })),
    ).toBe(false)
  })

  it('reads the accept header when the browser sends no fetch metadata', () => {
    expect(isTopLevelNavigation(get({ accept: 'text/html,application/xhtml+xml' }))).toBe(true)
    expect(isTopLevelNavigation(get({ accept: 'image/*' }))).toBe(false)
    expect(isTopLevelNavigation(get({}))).toBe(false)
  })
})
