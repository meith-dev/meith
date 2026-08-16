import 'server-only'

export type PasskeyPurpose = 'register' | 'authenticate'

export function packChallenge(purpose: PasskeyPurpose, challenge: string): string {
  return `${purpose}:${challenge}`
}

export function unpackChallenge(
  raw: string | undefined,
  purpose: PasskeyPurpose,
): string | null {
  if (raw === undefined) return null

  const separator = raw.indexOf(':')
  if (separator < 0) return null
  if (raw.slice(0, separator) !== purpose) return null

  const challenge = raw.slice(separator + 1)
  return challenge === '' ? null : challenge
}
