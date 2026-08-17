import 'server-only'

import { type SignatureLimits, signatureHtml } from '@meith/signatures'

import { getContainer } from './container'
import { getActor } from './context'

export function signatureStore() {
  return getContainer().signatures
}

export async function viewerSignatureLimits(): Promise<SignatureLimits> {
  const actor = await getActor()
  const { authorizer } = getContainer()

  return {
    canUse: authorizer.can(actor, 'signature.use'),
    maxLength: authorizer.globalLimit(actor, 'maxSignatureLength'),
  }
}

export async function signaturesFor(
  userIds: readonly number[],
): Promise<ReadonlyMap<number, string>> {
  const store = signatureStore()
  if (store === null || userIds.length === 0) return new Map()

  try {
    const stored = await store.readMany(userIds)
    const out = new Map<number, string>()

    for (const [userId, signature] of stored) {
      const html = signatureHtml(signature)
      if (html !== null) out.set(userId, html)
    }
    return out
  } catch {
    return new Map()
  }
}
