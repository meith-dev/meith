import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@meith/core/env'

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
import {
  contentSecurityPolicy,
  newNonce,
  readsAsAsset,
} from './src/server/content-security-policy'
import {
  FRESH_GUEST_HEADER,
  NONCE_HEADER,
  PATH_HEADER,
  QUERY_HEADER,
} from './src/server/location-header'
import {
  PREFERENCE_COOKIE_MAX_AGE,
  THEME_COOKIE,
  THEME_QUERY,
  themeFromQuery,
} from './src/view/theme-preference'

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

const CSP_HEADER = 'content-security-policy'

interface Policy {
  readonly nonce: string
  readonly value: string
}

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
function withPath(req: NextRequest, policy: Policy): NextResponse {
  const fresh = !req.cookies.has(GUEST_COOKIE) && !req.cookies.has(DEV_GUEST_COOKIE)

  const headers = new Headers(req.headers)
  headers.set(NONCE_HEADER, policy.nonce)
  headers.set(CSP_HEADER, policy.value)
  headers.set(PATH_HEADER, req.nextUrl.pathname)
  if (req.nextUrl.search === '') headers.delete(QUERY_HEADER)
  else headers.set(QUERY_HEADER, req.nextUrl.search)
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

function themeRedirect(req: NextRequest): NextResponse | null {
  if (req.method !== 'GET') return null

  const requested = themeFromQuery(req.nextUrl.searchParams.get(THEME_QUERY))
  if (requested === null) return null

  const url = req.nextUrl.clone()
  url.searchParams.delete(THEME_QUERY)

  const res = NextResponse.redirect(url)
  res.cookies.set(THEME_COOKIE, requested, {
    path: '/',
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  })
  return res
}

function triage(req: NextRequest, policy: Policy): NextResponse {
  const themed = themeRedirect(req)
  if (themed !== null) return themed

  const { pathname, search } = req.nextUrl
  const hasSession = req.cookies.has(SESSION_COOKIE) || req.cookies.has(DEV_SESSION_COOKIE)
  const hasRemember = req.cookies.has(REMEMBER_COOKIE) || req.cookies.has(DEV_REMEMBER_COOKIE)

  if (hasSession) return withPath(req, policy)

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

  return withPath(req, policy)
}

export function proxy(req: NextRequest): NextResponse {
  const nonce = newNonce()
  const policy: Policy = {
    nonce,
    value: contentSecurityPolicy({
      nonce,
      development: env.NODE_ENV !== 'production',
      remoteImages: env.REMOTE_IMAGES,
    }),
  }

  const res = readsAsAsset(req.nextUrl.pathname)
    ? NextResponse.next()
    : triage(req, policy)

  res.headers.set(CSP_HEADER, policy.value)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
