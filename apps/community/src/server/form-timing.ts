import 'server-only'

import { createHmac, randomBytes } from 'node:crypto'

import { env, timingSafeEqualString } from '@meith/core'

const DEVELOPMENT_SECRET = randomBytes(32).toString('base64url')
const TTL_MS = 30 * 60 * 1000

function sign(stamp: string): string {
  return createHmac('sha256', env.AUTH_SECRET ?? DEVELOPMENT_SECRET)
    .update(`registration-timing:${stamp}`)
    .digest('base64url')
}

export function issueFormTiming(now = Date.now()): string {
  const stamp = String(now)
  return `${stamp}.${sign(stamp)}`
}

export function readFormTiming(raw: FormDataEntryValue | null, now = Date.now()): number | null {
  if (typeof raw !== 'string' || raw.length > 128) return null
  const dot = raw.indexOf('.')
  if (dot < 0) return null
  const stamp = raw.slice(0, dot)
  const issuedAt = Number(stamp)
  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt <= 0 ||
    issuedAt > now ||
    now - issuedAt > TTL_MS
  ) {
    return null
  }
  return timingSafeEqualString(raw.slice(dot + 1), sign(stamp)) ? issuedAt : null
}
