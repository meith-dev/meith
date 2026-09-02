export const SESSION_COOKIE = '__Host-fs_session'
export const REMEMBER_COOKIE = '__Host-fs_remember'
export const DEV_SESSION_COOKIE = 'fs_session'
export const DEV_REMEMBER_COOKIE = 'fs_remember'

export const GUEST_COOKIE = '__Host-fs_guest'
export const DEV_GUEST_COOKIE = 'fs_guest'

export const GUEST_COOKIE_DAYS = 1

export const ADMIN_COOKIE = 'fs_admin'
export const ADMIN_COOKIE_PATH = '/admin'

export const ADMIN_SECOND_FACTOR_COOKIE = 'fs_admin_2fa'
export const ADMIN_SECOND_FACTOR_MINUTES = 10

export const SSO_COOKIE = '__Host-fs_sso'
export const DEV_SSO_COOKIE = 'fs_sso'

export const PASSKEY_COOKIE = '__Host-fs_passkey'
export const DEV_PASSKEY_COOKIE = 'fs_passkey'

export const SECOND_FACTOR_COOKIE = '__Host-fs_2fa'
export const DEV_SECOND_FACTOR_COOKIE = 'fs_2fa'

export const HANDSHAKE_MINUTES = 10

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

export function adminSecondFactorCookie(expires: Date, secure: boolean): CookieAttrs {
  return { httpOnly: true, secure, sameSite: 'strict', path: ADMIN_COOKIE_PATH, expires }
}

export function clearedAdminSecondFactorCookie(secure: boolean): CookieAttrs {
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

export function ssoCookieName(secure: boolean): string {
  return secure ? SSO_COOKIE : DEV_SSO_COOKIE
}

export function passkeyCookieName(secure: boolean): string {
  return secure ? PASSKEY_COOKIE : DEV_PASSKEY_COOKIE
}

export function secondFactorCookieName(secure: boolean): string {
  return secure ? SECOND_FACTOR_COOKIE : DEV_SECOND_FACTOR_COOKIE
}

export function secondFactorCookie(expires: Date, secure: boolean): CookieAttrs {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/', expires }
}

export function ssoCookie(secure: boolean): CookieAttrs {
  return { ...base(secure), maxAge: HANDSHAKE_MINUTES * 60 }
}

export function passkeyCookie(secure: boolean): CookieAttrs {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: HANDSHAKE_MINUTES * 60,
  }
}
