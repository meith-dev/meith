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
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  clearedCookie,
  rememberCookie,
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
  jar.set(SESSION_COOKIE, token, sessionCookie(expiresAt, secure()))
}

export async function setRememberCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const jar = await cookies()
  jar.set(REMEMBER_COOKIE, token, rememberCookie(expiresAt, secure()))
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, '', clearedCookie(secure()))
  jar.set(REMEMBER_COOKIE, '', clearedCookie(secure()))
}

/** Read the current remember-me token (route-handler use). */
export async function readRememberToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(REMEMBER_COOKIE)?.value
}

/** Read the current session token (logout needs it to revoke server-side). */
export async function readSessionToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(SESSION_COOKIE)?.value
}
