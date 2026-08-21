import 'server-only'

export type PasskeyPurpose = 'register' | 'authenticate' | 'second-factor' | 'credential-proof'

export interface PasskeyChallenge {
  readonly challenge: string
  readonly userId?: number
  readonly sessionId?: number
  readonly provedAt?: number
}

export function packChallenge(
  purpose: PasskeyPurpose,
  challenge: string,
  binding: Omit<PasskeyChallenge, 'challenge'> = {},
): string {
  return `${purpose}:${encodeURIComponent(JSON.stringify({ challenge, ...binding }))}`
}

export function unpackChallenge(
  raw: string | undefined,
  purpose: PasskeyPurpose,
): PasskeyChallenge | null {
  if (raw === undefined) return null

  const separator = raw.indexOf(':')
  if (separator < 0 || raw.slice(0, separator) !== purpose) return null

  try {
    const value = JSON.parse(decodeURIComponent(raw.slice(separator + 1))) as Record<
      string,
      unknown
    >
    if (typeof value.challenge !== 'string' || value.challenge === '') return null
    if (value.userId !== undefined && !Number.isInteger(value.userId)) return null
    if (value.sessionId !== undefined && !Number.isInteger(value.sessionId)) return null
    if (value.provedAt !== undefined && !Number.isInteger(value.provedAt)) return null
    return value as unknown as PasskeyChallenge
  } catch {
    return null
  }
}
