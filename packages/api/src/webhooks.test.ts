import { describe, expect, it } from 'vitest'

import {
  DELIVERY_HEADER,
  MAX_ATTEMPTS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  WEBHOOK_TOPICS,
  deliveryHeaders,
  isWebhookTopic,
  nextRetryDelaySeconds,
  signPayload,
  verdictFor,
  verifySignature,
  type WebhookSubscription,
} from './webhooks'

const SECRET = 'whsec_example'
const BODY = '{"topic":"post.created","postId":4102}'
const AT = 1_772_270_040

const subscription: WebhookSubscription = {
  id: 3,
  url: 'https://example.test/hook',
  secret: SECRET,
  topics: ['post.created'],
  active: true,
}

describe('signing', () => {
  it('is stable for the same secret, timestamp and body', () => {
    expect(signPayload(SECRET, AT, BODY)).toBe(signPayload(SECRET, AT, BODY))
    expect(signPayload(SECRET, AT, BODY)).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('changes with the secret, the timestamp and the body', () => {
    const base = signPayload(SECRET, AT, BODY)
    expect(signPayload('other', AT, BODY)).not.toBe(base)
    expect(signPayload(SECRET, AT + 1, BODY)).not.toBe(base)
    expect(signPayload(SECRET, AT, `${BODY} `)).not.toBe(base)
  })

  /*
   * The timestamp is *inside* the signed material, which is the whole replay
   * story: an attacker replaying a captured delivery cannot move it forward
   * without invalidating the signature, and cannot leave it where it is without
   * failing the freshness check.
   */
  it('signs the timestamp, not merely sends it', () => {
    const forged = signPayload(SECRET, AT, BODY)
    expect(verifySignature(SECRET, AT + 10_000, BODY, forged, AT + 10_000)).toBe(false)
  })
})

describe('verifying, as a receiver would', () => {
  it('accepts a fresh, correctly signed delivery', () => {
    const signature = signPayload(SECRET, AT, BODY)
    expect(verifySignature(SECRET, AT, BODY, signature, AT + 10)).toBe(true)
  })

  it('rejects a delivery older than the tolerance', () => {
    const signature = signPayload(SECRET, AT, BODY)
    expect(verifySignature(SECRET, AT, BODY, signature, AT + 301)).toBe(false)
    expect(verifySignature(SECRET, AT, BODY, signature, AT + 299)).toBe(true)
  })

  /* Clock skew runs both ways; a receiver slightly behind must still accept. */
  it('rejects a delivery too far in the future', () => {
    const signature = signPayload(SECRET, AT, BODY)
    expect(verifySignature(SECRET, AT, BODY, signature, AT - 301)).toBe(false)
    expect(verifySignature(SECRET, AT, BODY, signature, AT - 299)).toBe(true)
  })

  it('rejects a tampered body, a wrong secret and a truncated signature', () => {
    const signature = signPayload(SECRET, AT, BODY)
    expect(verifySignature(SECRET, AT, `${BODY}x`, signature, AT)).toBe(false)
    expect(verifySignature('wrong', AT, BODY, signature, AT)).toBe(false)
    expect(verifySignature(SECRET, AT, BODY, signature.slice(0, -2), AT)).toBe(false)
  })
})

describe('delivery headers', () => {
  const headers = deliveryHeaders(
    subscription,
    { subscriptionId: 3, topic: 'post.created', deliveryId: 'dlv_1', payload: {} },
    AT,
    BODY,
  )

  it('carries the event, the delivery id, the timestamp and the signature', () => {
    expect(headers['x-community-event']).toBe('post.created')
    expect(headers[DELIVERY_HEADER]).toBe('dlv_1')
    expect(headers[TIMESTAMP_HEADER]).toBe(String(AT))
    expect(headers[SIGNATURE_HEADER]).toBe(signPayload(SECRET, AT, BODY))
  })

  /*
   * The delivery id is stable across retries, which is what makes a receiver's
   * idempotency possible at all. A fresh id per attempt turns "we retried" into
   * "we sent two events", and duplicate suppression becomes impossible to write.
   */
  it('keeps the delivery id when the same delivery is re-sent', () => {
    const retry = deliveryHeaders(
      subscription,
      { subscriptionId: 3, topic: 'post.created', deliveryId: 'dlv_1', payload: {} },
      AT + 60,
      BODY,
    )
    expect(retry[DELIVERY_HEADER]).toBe(headers[DELIVERY_HEADER])
    /* …while the signature legitimately changes, because the timestamp did. */
    expect(retry[SIGNATURE_HEADER]).not.toBe(headers[SIGNATURE_HEADER])
  })

  it('never leaks the secret into a header', () => {
    expect(JSON.stringify(headers)).not.toContain(SECRET)
  })
})

describe('retry schedule', () => {
  /* Randomness injected, so the bounds are assertable rather than assumed. */
  const noJitter = () => 0.5

  it('doubles from thirty seconds', () => {
    expect(nextRetryDelaySeconds(1, noJitter)).toBe(30)
    expect(nextRetryDelaySeconds(2, noJitter)).toBe(60)
    expect(nextRetryDelaySeconds(3, noJitter)).toBe(120)
  })

  it('caps at an hour', () => {
    expect(nextRetryDelaySeconds(5, noJitter)).toBeLessThanOrEqual(3600)
  })

  it('gives up after the last attempt', () => {
    expect(nextRetryDelaySeconds(MAX_ATTEMPTS, noJitter)).toBeNull()
    expect(nextRetryDelaySeconds(MAX_ATTEMPTS + 1, noJitter)).toBeNull()
  })

  /*
   * The jitter is not decoration. A subscriber going down takes every pending
   * delivery with it, and a fixed schedule brings all of them back at the same
   * instant — a thundering herd aimed at a server that is already unwell.
   */
  it('spreads retries either side of the base delay', () => {
    expect(nextRetryDelaySeconds(2, () => 0)).toBe(45)
    expect(nextRetryDelaySeconds(2, () => 1)).toBe(75)
  })
})

describe('what counts as delivered', () => {
  it.each([200, 201, 202, 204, 299])('treats %i as delivered', (status) => {
    expect(verdictFor(status, 1)).toBe('delivered')
  })

  it.each([500, 502, 429, 400, 404])('retries %i while attempts remain', (status) => {
    expect(verdictFor(status, 1)).toBe('retry')
  })

  /*
   * 410 Gone is the receiver saying the endpoint is finished. Hammering it six
   * times over an hour to hear the same answer helps nobody.
   */
  it('stops immediately on 410 Gone', () => {
    expect(verdictFor(410, 1)).toBe('dead')
  })

  it('dead-letters once the attempts run out', () => {
    expect(verdictFor(500, MAX_ATTEMPTS)).toBe('dead')
  })
})

describe('topics', () => {
  it('recognises exactly the declared list', () => {
    expect(isWebhookTopic('post.created')).toBe(true)
    expect(isWebhookTopic('view.post-bit')).toBe(false)
  })

  /*
   * Deliberately not the plugin hook registry. A hook is an in-process
   * extension point that moves as the board is built; a webhook topic is a
   * contract with somebody else's software and moves at a different speed.
   */
  it('is a short list, not a mirror of the hook registry', () => {
    expect(WEBHOOK_TOPICS.length).toBeLessThan(12)
  })
})
