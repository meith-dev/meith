import type { SessionRecord } from './ports'

export const CREDENTIAL_PROOF_TTL_MS = 10 * 60 * 1_000

export function hasFreshCredentialProof(
  session: SessionRecord,
  userId: number,
  now: Date,
): boolean {
  if (session.userId !== userId) return false
  if (session.revokedAt !== null || session.supersededBySessionId !== null) return false
  if (session.expiresAt.getTime() <= now.getTime()) return false
  if (session.credentialProvedAt === null) return false

  const age = now.getTime() - session.credentialProvedAt.getTime()
  return age >= 0 && age <= CREDENTIAL_PROOF_TTL_MS
}
