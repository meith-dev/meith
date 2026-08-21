import { describe, expect, it } from 'vitest'

import { CREDENTIAL_PROOF_TTL_MS, hasFreshCredentialProof } from './credential-proof'
import type { SessionRecord } from './ports'

const now = new Date('2026-08-20T12:00:00Z')

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 1,
    userId: 7,
    expiresAt: new Date(now.getTime() + CREDENTIAL_PROOF_TTL_MS + 60_000),
    revokedAt: null,
    supersededBySessionId: null,
    credentialProvedAt: now,
    lastSeenAt: now,
    ...overrides,
  }
}

describe('hasFreshCredentialProof', () => {
  it('accepts proof through the ten-minute boundary', () => {
    expect(
      hasFreshCredentialProof(session(), 7, new Date(now.getTime() + CREDENTIAL_PROOF_TTL_MS)),
    ).toBe(true)
  })

  it('rejects expired, revoked, superseded, and cross-user proof', () => {
    expect(
      hasFreshCredentialProof(session(), 7, new Date(now.getTime() + CREDENTIAL_PROOF_TTL_MS + 1)),
    ).toBe(false)
    expect(hasFreshCredentialProof(session({ revokedAt: now }), 7, now)).toBe(false)
    expect(hasFreshCredentialProof(session({ supersededBySessionId: 2 }), 7, now)).toBe(false)
    expect(hasFreshCredentialProof(session(), 8, now)).toBe(false)
  })
})
