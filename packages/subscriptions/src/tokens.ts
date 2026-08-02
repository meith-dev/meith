/**
 * F56 — the unsubscribe link that needs no login.
 *
 * A digest arrives in a mail client, and the person reading it may not be
 * signed in — may not even be at the same machine. Asking them to log in first
 * is how a member who wants out marks the message as spam instead, which costs
 * the whole board's deliverability. So the link carries its own authority.
 *
 * ## Stateless, not a table
 *
 * The token is an HMAC over the three facts an unsubscribe needs — who, what
 * kind of thing, which one — keyed by the board's `AUTH_SECRET`. No row is
 * written, nothing has to be swept, and there is no window in which a valid
 * link exists for a subscription that has gone.
 *
 * The tradeoff is stated rather than hidden: a token cannot be revoked
 * individually, only by rotating the board secret (which invalidates every
 * session too). That is acceptable because of what the token *can do*, which is
 * the next point.
 *
 * ## The token unsubscribes and nothing else
 *
 * It authorises exactly one act against exactly one subscription. It is not a
 * session, it cannot read the member's subscriptions, and it says nothing about
 * them that the person holding the e-mail does not already have in front of
 * them. Somebody who intercepts one can stop a member being notified about one
 * thread — the same thing they could do by deleting the mail.
 *
 * ## Constant-time comparison
 *
 * Verification compares digests with `timingSafeEqualString`, not `===`.
 * A byte-at-a-time comparison over an attacker-supplied token is the textbook
 * way to forge one.
 */
import { createHmac } from 'node:crypto'

import { timingSafeEqualString } from '@forum/core'

import type { SubscriptionTarget } from './modes'

/**
 * What an unsubscribe link can act on.
 *
 * `thread` and `forum` end one subscription — the link in an "as it happens"
 * notification, where the member knows exactly which thread annoyed them.
 *
 * `email` is the digest's link, and it is a different act on purpose: a digest
 * covers many subscriptions, so "unsubscribe" cannot mean one of them, and
 * silently ending all of them would delete a member's follow list because they
 * wanted fewer e-mails. It switches subscription **e-mail** off — the
 * subscriptions and their on-site notifications survive, which is exactly the
 * distinction F55's preferences screen already draws.
 */
export type UnsubscribeScope = SubscriptionTarget | 'email'

export function parseUnsubscribeScope(value: string): UnsubscribeScope | null {
  return value === 'thread' || value === 'forum' || value === 'email' ? value : null
}

/** What an unsubscribe token asserts. */
export interface UnsubscribeClaim {
  readonly userId: number
  readonly scope: UnsubscribeScope
  /** The thread or forum id; `0` for the board-wide `email` scope. */
  readonly targetId: number
}

/**
 * Version prefix.
 *
 * Every token carries it, and verification requires it. If the payload ever
 * needs another field, `v2` tokens can be accepted alongside `v1` ones instead
 * of every outstanding e-mail's link silently becoming invalid — which,
 * for links that live in inboxes for months, is the difference between a
 * migration and a support queue.
 */
const VERSION = 'v1'

/** Truncated to 32 base64url characters — 192 bits, ample for a bearer link. */
const DIGEST_LENGTH = 32

function digest(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, DIGEST_LENGTH)
}

function payloadOf(claim: UnsubscribeClaim): string {
  return `${VERSION}.${claim.userId}.${claim.scope}.${claim.targetId}`
}

/** Mint a link's token. The caller appends it to `/unsubscribe?token=`. */
export function mintUnsubscribeToken(claim: UnsubscribeClaim, secret: string): string {
  return `${payloadOf(claim)}.${digest(payloadOf(claim), secret)}`
}

/**
 * Read a token, or `null`.
 *
 * Every failure — wrong shape, unknown version, bad target, non-numeric id,
 * wrong signature — returns the same `null`. Distinguishing them would tell
 * somebody probing the endpoint which part of their forgery to fix.
 */
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

  /* `email` carries no target, and `0` is the only value it may carry. */
  const targetPattern = scope === 'email' ? /^0$/ : /^[1-9]\d*$/
  if (!/^[1-9]\d*$/.test(rawUserId) || !targetPattern.test(rawTargetId)) return null
  const userId = Number(rawUserId)
  const targetId = Number(rawTargetId)
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(targetId)) return null

  const claim: UnsubscribeClaim = { userId, scope, targetId }
  if (!timingSafeEqualString(signature, digest(payloadOf(claim), secret))) return null

  return claim
}
