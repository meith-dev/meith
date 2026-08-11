import { NextResponse, type NextRequest } from 'next/server'

import {
  PREFERENCE_COOKIE_MAX_AGE,
  THEME_COOKIE,
  THEME_QUERY,
  themeFromQuery,
} from './src/view/theme-preference'

export function middleware(request: NextRequest): NextResponse {
  if (request.method !== 'GET') return NextResponse.next()

  const requested = themeFromQuery(request.nextUrl.searchParams.get(THEME_QUERY))
  if (requested === null) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.searchParams.delete(THEME_QUERY)

  const response = NextResponse.redirect(url)
  response.cookies.set(THEME_COOKIE, requested, {
    path: '/',
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  })

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|uploads|favicon.ico).*)'],
}
