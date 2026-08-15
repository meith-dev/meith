import { describe, expect, it } from 'vitest'

import { contentSecurityPolicy, newNonce, readsAsAsset } from './content-security-policy'

function directive(policy: string, name: string): string {
  const found = policy.split('; ').find((part) => part.startsWith(`${name} `))
  if (found === undefined) throw new Error(`no ${name} directive in: ${policy}`)
  return found
}

describe('contentSecurityPolicy', () => {
  it('lets an inline script run only with this request’s nonce', () => {
    const policy = contentSecurityPolicy({ nonce: 'r4nd0m' })

    expect(directive(policy, 'script-src')).toBe(
      "script-src 'self' 'nonce-r4nd0m' 'strict-dynamic'",
    )
  })

  it('carries no unsafe-inline for scripts, in development either', () => {
    for (const development of [true, false]) {
      const policy = contentSecurityPolicy({ nonce: 'r4nd0m', development })
      expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'")
    }
  })

  it('allows eval only where React’s development build needs it', () => {
    expect(contentSecurityPolicy({ nonce: 'n', development: true })).toContain("'unsafe-eval'")
    expect(contentSecurityPolicy({ nonce: 'n', development: false })).not.toContain(
      "'unsafe-eval'",
    )
  })

  it('confines images to the board unless it has opted out', () => {
    expect(directive(contentSecurityPolicy({ nonce: 'n' }), 'img-src')).toBe(
      "img-src 'self' data:",
    )
    expect(
      directive(contentSecurityPolicy({ nonce: 'n', remoteImages: true }), 'img-src'),
    ).toBe("img-src 'self' data: https:")
  })

  it('keeps the rest of the header set it inherited', () => {
    const policy = contentSecurityPolicy({ nonce: 'n' })

    for (const part of [
      "default-src 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "connect-src 'self'",
    ]) {
      expect(policy).toContain(part)
    }
  })
})

describe('newNonce', () => {
  it('is different every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => newNonce()))
    expect(seen.size).toBe(50)
  })

  it('carries no character that would end the quoted source', () => {
    expect(newNonce()).toMatch(/^[A-Za-z0-9+/=]+$/)
  })
})

describe('readsAsAsset', () => {
  it('recognises the paths that render nothing', () => {
    expect(readsAsAsset('/robots.txt')).toBe(true)
    expect(readsAsAsset('/feed.xml')).toBe(true)
    expect(readsAsAsset('/favicon.ico')).toBe(true)
  })

  it('leaves board pages alone, dotted directory or not', () => {
    expect(readsAsAsset('/')).toBe(false)
    expect(readsAsAsset('/thread/12-hello')).toBe(false)
    expect(readsAsAsset('/attachment/9')).toBe(false)
    expect(readsAsAsset('/v1.2/thread')).toBe(false)
  })
})
