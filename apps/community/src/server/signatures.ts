import 'server-only'

/**
 * F58 — the app's one way to reach signatures.
 *
 * The read that matters is `signaturesFor`, and it is the reason the repository
 * has a `readMany`: a thread page shows a signature per distinct author, and a
 * query per author is an N+1 on the board's heaviest page.
 *
 * The limits come from the Authorizer, because `canUseSignature` and
 * `maxSignatureLength` are group permissions and this board resolves those in
 * exactly one place (F20). Both have been in the registry since F22 with
 * nothing reading them; F58 is what they were declared for.
 */
import { signatureHtml, type SignatureLimits } from '@meith/signatures'

import { getContainer } from './container'
import { getActor } from './context'

export function signatureStore() {
  return getContainer().signatures
}

/** What the *viewer* may do with their own signature. */
export async function viewerSignatureLimits(): Promise<SignatureLimits> {
  const actor = await getActor()
  const { authorizer } = getContainer()

  return {
    canUse: authorizer.can(actor, 'signature.use'),
    maxLength: authorizer.globalLimit(actor, 'maxSignatureLength'),
  }
}

/**
 * The signature HTML for a set of authors, keyed by user id.
 *
 * One query for the whole page. Locked and empty signatures resolve to `null`
 * inside `signatureHtml`, so nothing downstream has to remember the rule — and
 * an author with nothing to show is simply absent from the map.
 *
 * Never throws: a signature is decoration, and a thread page that 500s because
 * one member's is odd is worse in every way than one that renders without it.
 */
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
