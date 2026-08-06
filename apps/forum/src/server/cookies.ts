export const SESSION_COOKIE = '__Host-fs_session'
export const REMEMBER_COOKIE = '__Host-fs_remember'
export const DEV_SESSION_COOKIE = 'fs_session'
export const DEV_REMEMBER_COOKIE = 'fs_remember'

export const ADMIN_COOKIE = 'fs_admin'
export const ADMIN_COOKIE_PATH = '/admin'

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE : DEV_SESSION_COOKIE
}

export function rememberCookieName(secure: boolean): string {
  return secure ? REMEMBER_COOKIE : DEV_REMEMBER_COOKIE
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
