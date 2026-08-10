import 'server-only'

import { cookies } from 'next/headers'

import { env } from '@meith/core'

import {
  ADMIN_COOKIE,
  adminCookie,
  clearedAdminCookie,
  clearedCookie,
  rememberCookieName,
  rememberCookie,
  sessionCookieName,
  sessionCookie,
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
