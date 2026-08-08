/**
 * F81 — outbound webhooks: signing, retry, and dead-lettering.
 *
 * A webhook is the board making an HTTP request to somebody else's server, and
 * every hard part of it follows from that one sentence: the other server is
 * down, or slow, or was replaced by an attacker's, or receives the same delivery
 * twice and creates two tickets.
 *
 * ## Signed, and what the signature actually protects
 *
 * `sha256=<hex>` over `<timestamp>.<body>`, keyed with the subscription's
 * secret. Two properties, and the second is the one people leave out:
 *
 *  - **authenticity** — the body came from this board. Without it, a receiver's
 *    endpoint is a public write API: anybody who learns the URL can post a
 *    "post.created" and have it believed.
 *  - **replay resistance** — the timestamp is *inside* the signed material, so
 *    it cannot be edited without breaking the signature, and a receiver rejects
 *    anything older than its tolerance. Signing the body alone gives an attacker
 *    who captured one delivery an infinitely replayable message.
 *
 * The timestamp goes in a header as well, because a receiver has to read it
 * before it can verify anything.
 *
 * ## Delivery is a job, never an inline fetch
 *
 * A webhook fires from a request that just wrote something. Calling out inline
 * makes posting a reply as slow as the slowest subscriber and as reliable as
 * their uptime — and on a serverless platform it makes the *function* wait,
 * which is billed. So the write emits to the outbox (F07), the relay drains it
 * into `jobs`, and a worker delivers. The transactional outbox is what stops the
 * two failure modes an inline `await fetch()` cannot: a committed post with no
 * webhook, and a webhook for a post that rolled back.
 *
 * ## Retry, backoff, dead letter
 *
 * Exponential with a cap and **jitter**. The jitter is not decoration: a
 * subscriber that goes down takes every pending delivery with it, and a fixed
 * schedule brings all of them back at the same instant — a thundering herd
 * aimed at a server that is already unwell, repeatedly, in lockstep, for as long
 * as the retries last.
 *
 * After `MAX_ATTEMPTS` the delivery is dead-lettered rather than dropped. An
 * operator can see it, and can retry it once the receiver is fixed — which is
 * the whole reason the dead letter exists rather than a log line.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SIGNATURE_HEADER = 'x-community-signature'
export const TIMESTAMP_HEADER = 'x-community-timestamp'
export const EVENT_HEADER = 'x-community-event'
export const DELIVERY_HEADER = 'x-community-delivery'

/** How long a receiver should accept a signature for. Advice, enforced by them. */
export const REPLAY_TOLERANCE_SECONDS = 300

export const MAX_ATTEMPTS = 6

/**
 * Events a subscription may ask for.
 *
 * A deliberately small, stable list, and **not** the plugin hook registry. A
 * hook is an in-process extension point that changes as the board is built; a
 * webhook topic is a contract with somebody else's software, so it moves at a
 * different speed and is versioned separately.
 */
export const WEBHOOK_TOPICS = [
  'thread.created',
  'post.created',
  'post.edited',
  'post.deleted',
  'user.registered',
  'report.created',
] as const

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number]

export function isWebhookTopic(value: string): value is WebhookTopic {
  return (WEBHOOK_TOPICS as readonly string[]).includes(value)
}

export interface WebhookSubscription {
  readonly id: number
  readonly url: string
  readonly secret: string
  readonly topics: readonly WebhookTopic[]
  readonly active: boolean
}

export interface WebhookDelivery {
  readonly subscriptionId: number
  readonly topic: WebhookTopic
  readonly deliveryId: string
  readonly payload: Record<string, unknown>
}

/**
 * The signature for a body at a moment.
 *
 * `timestamp.body` rather than the body alone — see the header. The separator is
 * a dot and the timestamp is digits, so the two cannot be confused for one
 * another however the body starts.
 */
export function signPayload(secret: string, timestampSeconds: number, body: string): string {
  const mac = createHmac('sha256', secret)
  mac.update(`${timestampSeconds}.${body}`, 'utf8')
  return `sha256=${mac.digest('hex')}`
}

/**
 * Verify a signature the way a receiver should.
 *
 * Exported and tested because it is the code the *documentation* tells third
 * parties to reimplement, and a signing scheme whose verifier the board has
 * never run is a scheme with an off-by-one nobody has found.
 *
 * Constant-time, and the freshness check is part of verification rather than a
 * separate step a receiver can forget: an implementation that verifies and then
 * "means to" check the timestamp is the standard way replay protection is lost.
 */
export function verifySignature(
  secret: string,
  timestampSeconds: number,
  body: string,
  presented: string,
  nowSeconds: number,
  toleranceSeconds: number = REPLAY_TOLERANCE_SECONDS,
): boolean {
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false

  const expected = Buffer.from(signPayload(secret, timestampSeconds, body), 'utf8')
  const actual = Buffer.from(presented, 'utf8')
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

/** The headers a delivery carries. */
export function deliveryHeaders(
  subscription: WebhookSubscription,
  delivery: WebhookDelivery,
  timestampSeconds: number,
  body: string,
): Record<string, string> {
  return {
    'content-type': 'application/json',
    [EVENT_HEADER]: delivery.topic,
    /*
     * The delivery id is stable across retries, which is what makes the
     * receiver's idempotency possible. A new id per attempt would turn "we
     * retried" into "we sent two events", and duplicate-suppression on the
     * receiving side would be impossible to write.
     */
    [DELIVERY_HEADER]: delivery.deliveryId,
    [TIMESTAMP_HEADER]: String(timestampSeconds),
    [SIGNATURE_HEADER]: signPayload(subscription.secret, timestampSeconds, body),
  }
}

/**
 * When to try again, in seconds, or `null` when the delivery is dead.
 *
 * `attempt` is the number that has just *failed*, 1-based. Doubling from 30s
 * with a 1-hour ceiling and ±25% jitter.
 *
 * The randomness is injected rather than taken from `Math.random` so the
 * schedule is testable — a backoff whose jitter cannot be pinned is a backoff
 * whose bounds nobody has checked.
 */
export function nextRetryDelaySeconds(
  attempt: number,
  random: () => number = Math.random,
): number | null {
  if (attempt >= MAX_ATTEMPTS) return null

  const base = Math.min(30 * 2 ** (attempt - 1), 3600)
  const jitter = 1 + (random() - 0.5) / 2
  return Math.round(base * jitter)
}

/**
 * Whether a response counts as delivered.
 *
 * Any 2xx. Not "200 only": a receiver answering 202 has accepted the delivery
 * for later processing, which is the correct thing for them to do and exactly
 * the pattern this board uses for its own queue.
 *
 * A 410 Gone is a **permanent** failure and stops the retries immediately —
 * the receiver is telling us the endpoint is finished, and hammering it six
 * times over an hour to hear the same answer helps nobody.
 */
export type DeliveryVerdict = 'delivered' | 'retry' | 'dead'

export function verdictFor(status: number, attempt: number): DeliveryVerdict {
  if (status >= 200 && status < 300) return 'delivered'
  if (status === 410) return 'dead'
  return nextRetryDelaySeconds(attempt) === null ? 'dead' : 'retry'
}
