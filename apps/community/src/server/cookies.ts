/**
 * Cookie names and flags for the session + remember-me pair (F17).
 *
 * Pure constants and helpers — no `next/headers` import — so this is safe to
 * pull into the proxy (Edge), route handlers, and Server Components alike. The
 * actual read/write happens through whatever cookie jar the caller has.
 *
 * `__Host-` prefix: the browser only accepts a `__Host-` cookie when it is
 * Secure, Path=/, and has no Domain, which pins the cookie to this exact origin
 * and blocks subdomain injection. That is the strongest cookie scoping available
 * and costs nothing here since the session cookie is always first-party.
 */
export const SESSION_COOKIE = '__Host-fs_session'
export const REMEMBER_COOKIE = '__Host-fs_remember'
export const DEV_SESSION_COOKIE = 'fs_session'
export const DEV_REMEMBER_COOKIE = 'fs_remember'

/**
 * The ACP's own cookie (F63).
 *
 * A separate name *and a separate path*: `Path=/admin` means the browser does
 * not send it with ordinary board requests at all, so an XSS on a thread page
 * cannot reach it even in the absence of `HttpOnly` — which it also has. The
 * `__Host-` prefix requires `Path=/`, so the ACP cookie deliberately uses the
 * plain name and gains scoping instead.
 */
export const ADMIN_COOKIE = 'fs_admin'
export const ADMIN_COOKIE_PATH = '/admin'

/** `__Host-` requires Secure; use plain names only on local HTTP development. */
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

/**
 * Base flags for both cookies. `SameSite=Lax` (not Strict) so a top-level
 * navigation *to* the community from an external link still carries the session —
 * Strict would log the user out every time they follow a link in from email or
 * another site. HttpOnly keeps the token out of `document.cookie`, so an XSS
 * payload cannot read it.
 */
function base(secure: boolean): Omit<CookieAttrs, 'expires'> {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' }
}

export function sessionCookie(expires: Date, secure: boolean): CookieAttrs {
  return { ...base(secure), expires }
}

export function rememberCookie(expires: Date, secure: boolean): CookieAttrs {
  return { ...base(secure), expires }
}

/**
 * The ACP session cookie.
 *
 * `SameSite=Strict`, unlike the board's `Lax`: there is no legitimate reason to
 * arrive in the control panel by following a link from another site, and Strict
 * is what makes a cross-site request unable to carry ACP authority at all.
 */
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

/** Attributes that clear a cookie (past expiry, empty value). */
export function clearedCookie(secure: boolean): CookieAttrs {
  return { ...base(secure), expires: new Date(0), maxAge: 0 }
}
