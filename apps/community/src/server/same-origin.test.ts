import { describe, expect, it } from 'vitest'

import { isSameOrigin, isTopLevelNavigation } from './same-origin'

function post(headers: Record<string, string>): Request {
  return new Request('https://board.example/api/read/all', { method: 'POST', headers })
}

describe('isSameOrigin', () => {
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
