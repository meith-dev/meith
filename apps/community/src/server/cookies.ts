export const SESSION_COOKIE = '__Host-fs_session'
export const REMEMBER_COOKIE = '__Host-fs_remember'
export const DEV_SESSION_COOKIE = 'fs_session'
export const DEV_REMEMBER_COOKIE = 'fs_remember'

/**
 * Counts one reader once, and carries nothing else.
 *
 * An opaque random value, first-party, readable by nobody but this board. It
 * exists because "37 guests reading" is not derivable from a stateless request:
 * without something that comes back, every page view is a stranger. It is never
 * an identity — no code path turns it into an actor, and `locateSession()`
 * refuses a row with no user — so the worst it can say about the person holding
 * it is that they were here.
 */
export const GUEST_COOKIE = '__Host-fs_guest'
export const DEV_GUEST_COOKIE = 'fs_guest'

/** Long enough that a reader is one guest across a visit, short enough to expire. */
export const GUEST_COOKIE_DAYS = 1

export const ADMIN_COOKIE = 'fs_admin'
export const ADMIN_COOKIE_PATH = '/admin'

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE : DEV_SESSION_COOKIE
}

export function rememberCookieName(secure: boolean): string {
  return secure ? REMEMBER_COOKIE : DEV_REMEMBER_COOKIE
}

export function guestCookieName(secure: boolean): string {
  return secure ? GUEST_COOKIE : DEV_GUEST_COOKIE
}

export interface CookieAttrs {
  readonly httpOnly: boolean
  readonly secure: boolean
  readonly sameSite: 'lax' | 'strict' | 'none'
  readonly path: string
  readonly expires?: Date
  readonly maxAge?: number
}

function base(secure: boolean): Omit<CookieAttrs, 'expires'> {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' }
}

export function sessionCookie(expires: Date, secure: boolean): CookieAttrs {
  return { ...base(secure), expires }
}

export function rememberCookie(expires: Date, secure: boolean): CookieAttrs {
  return { ...base(secure), expires }
}

export function guestCookie(expires: Date, secure: boolean): CookieAttrs {
  return { ...base(secure), expires }
}

export function adminCookie(expires: Date, secure: boolean): CookieAttrs {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: ADMIN_COOKIE_PATH,
    expires,
  }
}

export function clearedAdminCookie(secure: boolean): CookieAttrs {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: ADMIN_COOKIE_PATH,
    expires: new Date(0),
    maxAge: 0,
  }
}

export function clearedCookie(secure: boolean): CookieAttrs {
  return { ...base(secure), expires: new Date(0), maxAge: 0 }
}
