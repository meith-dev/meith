import { NextResponse, type NextRequest } from 'next/server'

import {
  DEV_REMEMBER_COOKIE,
  DEV_SESSION_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
} from './src/server/cookies'
import { PATH_HEADER } from './src/server/location-header'

const PROTECTED_PREFIXES = ['/settings', '/messages', '/modcp', '/admincp']

const RESUME_PATH = '/auth/resume'

function withPath(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers)
  headers.set(PATH_HEADER, req.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
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
