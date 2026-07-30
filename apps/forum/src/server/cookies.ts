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
 * navigation *to* the forum from an external link still carries the session —
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

/** Attributes that clear a cookie (past expiry, empty value). */
export function clearedCookie(secure: boolean): CookieAttrs {
  return { ...base(secure), expires: new Date(0), maxAge: 0 }
}
