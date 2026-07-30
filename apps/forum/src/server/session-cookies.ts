import 'server-only'

/**
 * Writes the session/remember cookies onto the Next cookie jar.
 *
 * Split from `cookies.ts` (pure constants, Edge-safe) because this half imports
 * `next/headers`, which is only valid in the Node request scope — Server Actions
 * and route handlers. Keeping the `next/headers` dependency out of `cookies.ts`
 * is what lets the proxy import the cookie names without pulling server-only
 * request APIs into the Edge bundle.
 */
import { cookies } from 'next/headers'

import { env } from '@forum/core'

import {
  clearedCookie,
  rememberCookieName,
  rememberCookie,
  sessionCookieName,
  sessionCookie,
} from './cookies'

/**
 * `Secure` must be off in local http development or the browser silently drops
 * the cookie and every login "succeeds" yet never sticks. It is on everywhere
 * else. The `__Host-` prefix technically requires Secure, so on plain-http dev
 * the names still work because localhost is treated as a secure context by
 * modern browsers.
 */
function secure(): boolean {
  return env.NODE_ENV !== 'development'
}

export async function setSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(sessionCookieName(isSecure), token, sessionCookie(expiresAt, isSecure))
}

export async function setRememberCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(rememberCookieName(isSecure), token, rememberCookie(expiresAt, isSecure))
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(sessionCookieName(isSecure), '', clearedCookie(isSecure))
  jar.set(rememberCookieName(isSecure), '', clearedCookie(isSecure))
}

/** Read the current remember-me token (route-handler use). */
export async function readRememberToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(rememberCookieName(secure()))?.value
}

/** Read the current session token (logout needs it to revoke server-side). */
export async function readSessionToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(sessionCookieName(secure()))?.value
}
