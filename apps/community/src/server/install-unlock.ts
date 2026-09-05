import 'server-only'

import { createHmac } from 'node:crypto'

import { cookies } from 'next/headers'

import { env, timingSafeEqualString } from '@meith/core'

const UNLOCK_COOKIE = 'fs_install_unlock'

const UNLOCK_TTL_MS = 30 * 60 * 1000

function secure(): boolean {
  return env.NODE_ENV !== 'development'
}

function sign(issuedAt: number): string {
  return createHmac('sha256', env.AUTH_SECRET ?? '')
    .update(`install-unlock:${issuedAt}`)
    .digest('base64url')
}

export function operatorSecretMatches(candidate: string): boolean {
  const secret = env.AUTH_SECRET ?? ''
  return secret !== '' && candidate !== '' && timingSafeEqualString(candidate, secret)
}

export async function grantInstallUnlock(now = Date.now()): Promise<void> {
  const jar = await cookies()
  jar.set(UNLOCK_COOKIE, `${now}.${sign(now)}`, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'strict',
    path: '/install',
    maxAge: UNLOCK_TTL_MS / 1000,
  })
}

export async function installUnlocked(now = Date.now()): Promise<boolean> {
  if ((env.AUTH_SECRET ?? '') === '') return false

  const jar = await cookies()
  const raw = jar.get(UNLOCK_COOKIE)?.value
  if (raw === undefined) return false

  const dot = raw.indexOf('.')
  if (dot < 0) return false

  const issuedAt = Number(raw.slice(0, dot))
  if (!Number.isInteger(issuedAt) || now - issuedAt > UNLOCK_TTL_MS || issuedAt - now > 60_000) {
    return false
  }

  return timingSafeEqualString(raw.slice(dot + 1), sign(issuedAt))
}
