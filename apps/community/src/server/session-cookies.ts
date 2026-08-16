import 'server-only'

import { cookies } from 'next/headers'

import { env } from '@meith/core'

import { retireGuestPresence } from './presence'
import {
  ADMIN_COOKIE,
  adminCookie,
  clearedAdminCookie,
  clearedCookie,
  passkeyCookie,
  passkeyCookieName,
  rememberCookieName,
  rememberCookie,
  sessionCookieName,
  sessionCookie,
  ssoCookie,
  ssoCookieName,
} from './cookies'

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

  // They were a guest a moment ago, and that row is still inside the online
  // window. Left alone it counts them twice: once by name, once as somebody
  // anonymous who is really the same person.
  await retireGuestPresence()
}

export async function setRememberCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(rememberCookieName(isSecure), token, rememberCookie(expiresAt, isSecure))
}

export async function setAdminCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies()
  jar.set(ADMIN_COOKIE, token, adminCookie(expiresAt, secure()))
}

export async function clearAdminCookie(): Promise<void> {
  const jar = await cookies()
  jar.set(ADMIN_COOKIE, '', clearedAdminCookie(secure()))
}

export async function readAdminToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(ADMIN_COOKIE)?.value ?? null
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(sessionCookieName(isSecure), '', clearedCookie(isSecure))
  jar.set(rememberCookieName(isSecure), '', clearedCookie(isSecure))
}

export async function readRememberToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(rememberCookieName(secure()))?.value
}

export async function readSessionToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(sessionCookieName(secure()))?.value
}

export async function setHandshakeCookie(value: string): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(ssoCookieName(isSecure), value, ssoCookie(isSecure))
}

export async function readHandshakeCookie(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(ssoCookieName(secure()))?.value
}

export async function clearHandshakeCookie(): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(ssoCookieName(isSecure), '', clearedCookie(isSecure))
}

export async function setPasskeyChallengeCookie(value: string): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(passkeyCookieName(isSecure), value, passkeyCookie(isSecure))
}

export async function readPasskeyChallengeCookie(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(passkeyCookieName(secure()))?.value
}

export async function clearPasskeyChallengeCookie(): Promise<void> {
  const jar = await cookies()
  const isSecure = secure()
  jar.set(passkeyCookieName(isSecure), '', clearedCookie(isSecure))
}
