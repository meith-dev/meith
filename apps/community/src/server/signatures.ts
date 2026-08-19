import 'server-only'

import {
  renderStoredSignature,
  type SignatureLimits,
  type StoredSignature,
} from '@meith/signatures'

import { getContainer } from './container'
import { getActor } from './context'
import { boardRendering } from './markdown-pipeline'
import { filterView, viewerRef } from './plugin-view'

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

export async function renderSignature(
  authorId: number,
  stored: StoredSignature,
): Promise<string | null> {
  const html = await renderStoredSignature(stored, { authorId, rendering: boardRendering })
  if (html === null) return null

  return filterView('signature.html', html, { ...viewerRef(await getActor()), authorId })
}

export async function signaturesFor(
  userIds: readonly number[],
): Promise<ReadonlyMap<number, string>> {
  const store = signatureStore()
  if (store === null || userIds.length === 0) return new Map()

  try {
    const viewer = viewerRef(await getActor())
    const stored = await store.readMany(userIds)
    const out = new Map<number, string>()

    for (const [userId, signature] of stored) {
      const html = await renderStoredSignature(signature, {
        authorId: userId,
        rendering: boardRendering,
      })
      if (html === null) continue

      out.set(userId, await filterView('signature.html', html, { ...viewer, authorId: userId }))
    }
    return out
  } catch {
    return new Map()
  }
}
