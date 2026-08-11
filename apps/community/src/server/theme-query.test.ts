import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { middleware } from '../../middleware'
import { THEME_COOKIE } from '@/view/theme-preference'

function get(url: string, method = 'GET') {
  return middleware(new NextRequest(new Request(url, { method })))
}

describe('the ?theme= demo link', () => {
  it('sets the theme cookie and redirects to the same page without the parameter', () => {
    const response = get('https://board.example/f/3-general?theme=phasebook')

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://board.example/f/3-general')
    expect(response.cookies.get(THEME_COOKIE)?.value).toBe('phasebook')
  })

  it('keeps every other parameter', () => {
    const response = get('https://board.example/search?q=teak&theme=midnight&page=2')
    const location = new URL(response.headers.get('location')!)

    expect(location.searchParams.get('q')).toBe('teak')
    expect(location.searchParams.get('page')).toBe('2')
    expect(location.searchParams.has('theme')).toBe(false)
  })

  it('outlives the redirect, so the rest of the visit stays in that theme', () => {
    const cookie = get('https://board.example/?theme=phasebook').cookies.get(THEME_COOKIE)

    expect(cookie?.path).toBe('/')
    expect(cookie?.maxAge).toBeGreaterThan(0)
    expect(cookie?.httpOnly).toBe(false)
  })

  it('passes a request with no theme parameter straight through', () => {
    const response = get('https://board.example/f/3-general')

    expect(response.headers.get('location')).toBeNull()
    expect(response.cookies.get(THEME_COOKIE)).toBeUndefined()
  })

  it('ignores a malformed key rather than storing it', () => {
    const response = get('https://board.example/?theme=../etc/passwd')

    expect(response.headers.get('location')).toBeNull()
    expect(response.cookies.get(THEME_COOKIE)).toBeUndefined()
  })

  it('leaves a POST alone, so a form submission is never redirected away', () => {
    const response = get('https://board.example/f/3-general?theme=phasebook', 'POST')

    expect(response.headers.get('location')).toBeNull()
    expect(response.cookies.get(THEME_COOKIE)).toBeUndefined()
  })
})
