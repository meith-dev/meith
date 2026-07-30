/**
 * Edge proxy (Next 16's renamed middleware). F17: "resolves the cookie only".
 *
 * Deliberately does NO database work and makes NO authorization decision. The
 * Edge runtime has no access to the postgres.js client, and — more importantly —
 * the permission model lives entirely in `@forum/authorization`, which the proxy
 * must never re-implement. All it does is a cheap, cookie-shaped triage:
 *
 *  - If neither a session nor a remember-me cookie is present, a request for a
 *    login-gated route is redirected straight to /login without waking the app.
 *  - If only a remember-me cookie is present, the request is routed through the
 *    resume endpoint, which (in the Node runtime, with the database) rotates the
 *    remember token and mints a session cookie, then bounces back. The proxy
 *    cannot do that rotation itself — it needs the store — so it only *detects*
 *    the situation and hands off.
 *
 * The real authorization check still happens server-side via `getActor()` on
 * every protected page; this is a fast-path, not a security boundary. A forged
 * cookie gets past the proxy and is rejected by `resolveSession` downstream.
 */
import { NextResponse, type NextRequest } from 'next/server'

import {
  DEV_REMEMBER_COOKIE,
  DEV_SESSION_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
} from './src/server/cookies'

/** Route prefixes that require a logged-in user. Everything else is public. */
const PROTECTED_PREFIXES = ['/settings', '/messages', '/modcp', '/admincp']

/** Where the remember-me cookie is exchanged for a session (Node runtime). */
const RESUME_PATH = '/auth/resume'

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl
  const hasSession = req.cookies.has(SESSION_COOKIE) || req.cookies.has(DEV_SESSION_COOKIE)
  const hasRemember = req.cookies.has(REMEMBER_COOKIE) || req.cookies.has(DEV_REMEMBER_COOKIE)

  // A live session cookie: nothing to do, let it through. (Validity is checked
  // server-side; presence is all the proxy judges.)
  if (hasSession) return NextResponse.next()

  // No session but a remember-me cookie: hand off to the resume endpoint, which
  // rotates the token and sets a session cookie, then returns the user here.
  if (hasRemember && pathname !== RESUME_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = RESUME_PATH
    url.search = ''
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  // Fully anonymous and asking for a gated route: straight to login.
  if (!hasRemember && isProtected(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  /*
   * Skip static assets and Next internals; run on everything else. The matcher
   * keeps the proxy off the hot path for `/_next/*` and files with extensions.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
