import { createHmac } from 'node:crypto'

import { timingSafeEqualString } from '@meith/core'

import type { SubscriptionTarget } from './modes'

export type UnsubscribeScope = SubscriptionTarget | 'email'

export function parseUnsubscribeScope(value: string): UnsubscribeScope | null {
  return value === 'thread' || value === 'forum' || value === 'email' ? value : null
}

export interface UnsubscribeClaim {
  readonly userId: number
  readonly scope: UnsubscribeScope
  readonly targetId: number
}

const VERSION = 'v1'

const DIGEST_LENGTH = 32

function digest(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, DIGEST_LENGTH)
}

function payloadOf(claim: UnsubscribeClaim): string {
  return `${VERSION}.${claim.userId}.${claim.scope}.${claim.targetId}`
}

export function mintUnsubscribeToken(claim: UnsubscribeClaim, secret: string): string {
  return `${payloadOf(claim)}.${digest(payloadOf(claim), secret)}`
}

export function readUnsubscribeToken(
  token: string,
  secret: string,
): UnsubscribeClaim | null {
  const parts = token.split('.')
  if (parts.length !== 5) return null

  const [version, rawUserId, rawScope, rawTargetId, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
  ]
  if (version !== VERSION) return null

  const scope = parseUnsubscribeScope(rawScope)
  if (scope === null) return null

  const targetPattern = scope === 'email' ? /^0$/ : /^[1-9]\d*$/
  if (!/^[1-9]\d*$/.test(rawUserId) || !targetPattern.test(rawTargetId)) return null
  const userId = Number(rawUserId)
  const targetId = Number(rawTargetId)
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(targetId)) return null

  const claim: UnsubscribeClaim = { userId, scope, targetId }
  if (!timingSafeEqualString(signature, digest(payloadOf(claim), secret))) return null

  return claim
}
