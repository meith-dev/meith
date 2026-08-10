import { NextResponse, type NextRequest } from 'next/server'

import {
  DEV_GUEST_COOKIE,
  DEV_REMEMBER_COOKIE,
  DEV_SESSION_COOKIE,
  GUEST_COOKIE,
  GUEST_COOKIE_DAYS,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  guestCookie,
  guestCookieName,
} from './src/server/cookies'
import { FRESH_GUEST_HEADER, PATH_HEADER } from './src/server/location-header'

export const PROTECTED_PREFIXES = [
  '/usercp',
  '/messages',
  '/notifications',
  '/subscriptions',
  '/moderation',
  '/modcp',
  '/admin',
]

const RESUME_PATH = '/auth/resume'

const DAY_MS = 86_400_000

/**
 * Passes the request through, and hands a reader something to be counted by.
 *
 * The cookie is minted here because the Edge is the only place that can set one
 * on an ordinary page response — a render cannot. The row it stands for is
 * written by the render, which has the database this runtime does not.
 *
 * Whether the client *returned* the cookie is the load-bearing part, and it
 * cannot be read downstream: Next reflects a cookie set here into the request
 * the render sees, so a first-ever visit is indistinguishable from a returning
 * one by cookie alone. Hence the header — set when the cookie is new, deleted
 * otherwise, so a crawler that never keeps one is never counted and a client
 * cannot supply its own.
 */
function withPath(req: NextRequest): NextResponse {
  const fresh = !req.cookies.has(GUEST_COOKIE) && !req.cookies.has(DEV_GUEST_COOKIE)

  const headers = new Headers(req.headers)
  headers.set(PATH_HEADER, req.nextUrl.pathname)
  if (fresh) headers.set(FRESH_GUEST_HEADER, '1')
  else headers.delete(FRESH_GUEST_HEADER)

  const res = NextResponse.next({ request: { headers } })
  if (!fresh) return res

  const secure = req.nextUrl.protocol === 'https:'
  res.cookies.set(
    guestCookieName(secure),
    crypto.randomUUID(),
    guestCookie(new Date(Date.now() + GUEST_COOKIE_DAYS * DAY_MS), secure),
  )
  return res
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl
  const hasSession = req.cookies.has(SESSION_COOKIE) || req.cookies.has(DEV_SESSION_COOKIE)
  const hasRemember = req.cookies.has(REMEMBER_COOKIE) || req.cookies.has(DEV_REMEMBER_COOKIE)

  if (hasSession) return withPath(req)

  if (hasRemember && pathname !== RESUME_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = RESUME_PATH
    url.search = ''
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  if (!hasRemember && isProtected(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  return withPath(req)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
