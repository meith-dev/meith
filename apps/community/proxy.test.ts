import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { NextRequest, type NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import { PROTECTED_PREFIXES, proxy } from './proxy'
import { GUEST_COOKIE } from './src/server/cookies'
import { FRESH_GUEST_HEADER, PATH_HEADER } from './src/server/location-header'

const here = path.dirname(fileURLToPath(import.meta.url))

function routeDirectories(prefix: string): readonly string[] {
  const segment = prefix.replace(/^\//, '')
  return [
    path.join(here, 'app', segment),
    path.join(here, 'app', '(board)', segment),
    path.join(here, 'app', '(auth)', segment),
  ]
}

describe('PROTECTED_PREFIXES', () => {
  it('names only routes that exist', () => {
    const missing = PROTECTED_PREFIXES.filter(
      (prefix) => !routeDirectories(prefix).some((dir) => existsSync(dir)),
    )

    expect(missing).toEqual([])
  })

  it('covers every member-facing panel a guest could be sent to sign in for', () => {
    expect([...PROTECTED_PREFIXES].sort()).toEqual([
      '/admin',
      '/messages',
      '/modcp',
      '/moderation',
      '/notifications',
      '/subscriptions',
      '/usercp',
    ])
  })

  it('has no prefix that is a prefix of another, which would be a dead entry', () => {
    for (const prefix of PROTECTED_PREFIXES) {
      const shadowed = PROTECTED_PREFIXES.filter(
        (other) => other !== prefix && prefix.startsWith(`${other}/`),
      )
      expect(shadowed).toEqual([])
    }
  })
})

describe('the guest cookie', () => {
  const request = (cookie?: string): NextRequest =>
    new NextRequest('https://board.example/2-announcements', {
      ...(cookie === undefined ? {} : { headers: { cookie } }),
    })

  function requestHeader(res: NextResponse, name: string): string | null {
    // What `NextResponse.next({ request: { headers } })` hands the render.
    const overridden = res.headers.get('x-middleware-override-headers')
    if (overridden === null || !overridden.split(',').includes(name)) return null
    return res.headers.get(`x-middleware-request-${name}`)
  }

  it('is minted for a reader who has not got one', () => {
    const res = proxy(request())
    expect(res.cookies.get(GUEST_COOKIE)?.value).toBeTruthy()
  })

  /**
   * The flag the render depends on. Without it a first-ever visit is
   * indistinguishable from a returning one — Next reflects the cookie set here
   * into the same request — and every crawler request writes a presence row.
   */
  it('tells the render the cookie is new, so a first visit is not counted', () => {
    expect(requestHeader(proxy(request()), FRESH_GUEST_HEADER)).toBe('1')
  })

  it('is not re-minted for a reader who sent one back', () => {
    const res = proxy(request(`${GUEST_COOKIE}=already-have-one`))

    expect(res.cookies.get(GUEST_COOKIE)).toBeUndefined()
    expect(requestHeader(res, FRESH_GUEST_HEADER)).toBeNull()
  })

  it('strips a freshness header the client supplied itself', () => {
    const req = new NextRequest('https://board.example/', {
      headers: { cookie: `${GUEST_COOKIE}=already-have-one`, [FRESH_GUEST_HEADER]: '1' },
    })

    expect(requestHeader(proxy(req), FRESH_GUEST_HEADER)).toBeNull()
  })

  it('still passes the path through, which the rest of presence needs', () => {
    expect(requestHeader(proxy(request()), PATH_HEADER)).toBe('/2-announcements')
  })
})
