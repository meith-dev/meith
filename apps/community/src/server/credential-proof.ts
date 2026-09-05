import 'server-only'

import { redirect } from 'next/navigation'

import { hasFreshCredentialProof, hashToken, type SessionRecord } from '@meith/accounts'

import { getContainer } from './container'
import { readSessionToken } from './session-cookies'

export interface CurrentCredentialProof {
  readonly session: SessionRecord
  readonly provedAt: Date
}

export async function currentCredentialProof(
  userId: number,
  now = new Date(),
): Promise<CurrentCredentialProof | null> {
  const session = await currentSessionRecord()
  if (session === null || !hasFreshCredentialProof(session, userId, now)) return null
  return { session, provedAt: session.credentialProvedAt! }
}

export async function requireFreshCredentialProof(
  userId: number,
  next = '/usercp/security',
): Promise<void> {
  if ((await currentCredentialProof(userId)) === null) {
    redirect(`/usercp/security/verify?next=${encodeURIComponent(next)}`)
  }
}

export async function markCurrentSessionCredentialProved(
  userId: number,
  at = new Date(),
): Promise<boolean> {
  const session = await currentSessionRecord()
  if (session === null || session.userId !== userId) return false
  return getContainer().accountStore.sessions.markCredentialProved(session.id, userId, at)
}

async function currentSessionRecord(): Promise<SessionRecord | null> {
  const token = await readSessionToken()
  if (token === undefined || token === '') return null
  return getContainer().accountStore.sessions.findByTokenHash(await hashToken(token))
}
