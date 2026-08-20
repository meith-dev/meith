import { decodeBase64UrlText, encodeBase64Url, isProviderKind } from '@meith/accounts'

import { isSafeLocalPath } from './safe-path'

export type HandshakeMode = 'sign-in' | 'link' | 'credential-proof'

export interface Handshake {
  readonly provider: string
  readonly mode: HandshakeMode
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
  readonly next: string
  readonly authorizationUrl: string
  readonly userId?: number
  readonly sessionId?: number
  readonly provedAt?: number
}

export function isProviderAddress(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function encodeHandshake(handshake: Handshake): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(handshake)))
}

export function decodeHandshake(raw: string | undefined): Handshake | null {
  if (raw === undefined || raw === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(decodeBase64UrlText(raw))
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const candidate = parsed as Record<string, unknown>

  const provider = text(candidate.provider)
  const mode = candidate.mode
  const state = text(candidate.state)
  const nonce = text(candidate.nonce)
  const codeVerifier = text(candidate.codeVerifier)
  const next = text(candidate.next)
  const authorizationUrl = text(candidate.authorizationUrl)

  if (provider === null || !isProviderKind(provider)) return null
  if (mode !== 'sign-in' && mode !== 'link' && mode !== 'credential-proof') return null
  if (state === null || nonce === null || codeVerifier === null) return null
  if (authorizationUrl === null || !isProviderAddress(authorizationUrl)) return null

  return {
    provider,
    mode,
    state,
    nonce,
    codeVerifier,
    authorizationUrl,
    next: next !== null && isSafeLocalPath(next) ? next : '/',
    ...(integer(candidate.userId) === null ? {} : { userId: integer(candidate.userId)! }),
    ...(integer(candidate.sessionId) === null ? {} : { sessionId: integer(candidate.sessionId)! }),
    ...(integer(candidate.provedAt) === null ? {} : { provedAt: integer(candidate.provedAt)! }),
  }
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}
