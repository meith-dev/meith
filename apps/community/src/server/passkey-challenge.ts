import 'server-only'

import { createHmac } from 'node:crypto'

import { env, timingSafeEqualString } from '@meith/core'

export type PasskeyPurpose = 'register' | 'authenticate' | 'second-factor' | 'credential-proof'

export const PASSKEY_CHALLENGE_TTL_MS = 10 * 60 * 1000

export const PASSKEY_CHALLENGE_TTL_SECONDS = PASSKEY_CHALLENGE_TTL_MS / 1000

const CLOCK_SKEW_MS = 60_000

export interface PasskeyChallenge {
  readonly challenge: string
  readonly issuedAt: number
  readonly userId?: number
  readonly sessionId?: number
  readonly provedAt?: number
}

function signature(purpose: PasskeyPurpose, payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET ?? '')
    .update(`${purpose}:${payload}`)
    .digest('base64url')
}

export function packChallenge(
  purpose: PasskeyPurpose,
  challenge: string,
  binding: Omit<PasskeyChallenge, 'challenge' | 'issuedAt'> = {},
  now: number = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({ challenge, issuedAt: now, ...binding })).toString(
    'base64url',
  )
  return `${purpose}:${payload}.${signature(purpose, payload)}`
}

export function unpackChallenge(
  raw: string | undefined,
  purpose: PasskeyPurpose,
  now: number = Date.now(),
): PasskeyChallenge | null {
  if (raw === undefined) return null

  const separator = raw.indexOf(':')
  if (separator < 0 || raw.slice(0, separator) !== purpose) return null

  const body = raw.slice(separator + 1)
  const dot = body.indexOf('.')
  if (dot < 0) return null

  const payload = body.slice(0, dot)
  const provided = body.slice(dot + 1)
  if (!timingSafeEqualString(provided, signature(purpose, payload))) return null

  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    if (typeof value.challenge !== 'string' || value.challenge === '') return null
    if (typeof value.issuedAt !== 'number' || !Number.isInteger(value.issuedAt)) return null
    if (now - value.issuedAt > PASSKEY_CHALLENGE_TTL_MS) return null
    if (value.issuedAt - now > CLOCK_SKEW_MS) return null
    if (value.userId !== undefined && !Number.isInteger(value.userId)) return null
    if (value.sessionId !== undefined && !Number.isInteger(value.sessionId)) return null
    if (value.provedAt !== undefined && !Number.isInteger(value.provedAt)) return null
    return value as unknown as PasskeyChallenge
  } catch {
    return null
  }
}
