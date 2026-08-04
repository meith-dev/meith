/**
 * F81 — the half of webhooks that talks to somebody else's server.
 *
 * Everything up to the request already existed and is tested: the queue, the
 * claim query with `for update skip locked`, the signature, the headers, the
 * backoff, and `verdictFor`. What was missing was the loop that actually
 * performs the fetch and writes the verdict back — and until it existed the
 * board enqueued deliveries that nothing ever sent.
 *
 * ## Why the outbound request is the interesting part
 *
 * Every other task in this scheduler talks to Postgres, which either answers or
 * fails. This one talks to a **subscriber's** server, which can also accept the
 * connection and then say nothing for as long as it likes. A hung receiver must
 * not become a hung tick: the whole run is bounded by `maxDurationSeconds` in
 * the task registry, and each individual request by its own timeout here, so
 * one unresponsive subscriber costs one timeout rather than the entire batch.
 *
 * ## What is deliberately not here
 *
 * No redirect following. A 3xx from a webhook endpoint is a misconfiguration —
 * the operator gave the board one URL and the board sends to that URL — and
 * following it would let a subscriber move deliveries to a host the operator
 * never authorised, signed with their secret.
 */
import { deliveryHeaders, nextRetryDelaySeconds, verdictFor, type WebhookTopic } from '@meith/api'
import { logger } from '@meith/core'

/** One claimed row, as `PostgresWebhookRepository.claimDue` returns it. */
export interface ClaimedDelivery {
  readonly id: number
  readonly webhookId: number
  readonly deliveryId: string
  readonly topic: string
  readonly payload: Record<string, unknown>
  /** Already incremented by the claim, so 1 on the first send. */
  readonly attempts: number
  readonly url: string
  readonly secret: string
}

export interface WebhookDeliveryStore {
  claimDue(now: Date, limit: number): Promise<readonly ClaimedDelivery[]>
  markDelivered(id: number, status: number, at: Date): Promise<void>
  scheduleRetry(id: number, at: Date, status: number | null, error: string): Promise<void>
  markDead(id: number, status: number | null, error: string, at: Date): Promise<void>
}

/** How long a single subscriber gets to answer. */
export const REQUEST_TIMEOUT_MS = 10_000

export interface DeliverWebhooksResult {
  readonly attempted: number
  readonly delivered: number
  readonly retried: number
  readonly dead: number
}

export interface DeliverWebhooksOptions {
  readonly now?: Date
  /** Injected so the backoff's jitter is pinnable in a test. */
  readonly random?: () => number
  /** Injected so a test never opens a socket. */
  readonly fetchImpl?: typeof fetch
}

export async function deliverWebhooks(
  store: WebhookDeliveryStore,
  limit: number,
  options: DeliverWebhooksOptions = {},
): Promise<DeliverWebhooksResult> {
  const now = options.now ?? new Date()
  const doFetch = options.fetchImpl ?? fetch
  const log = () => logger({ module: 'webhooks' })

  const claimed = await store.claimDue(now, limit)
  let delivered = 0
  let retried = 0
  let dead = 0

  for (const row of claimed) {
    /*
     * Serialised once and signed over the exact bytes that are sent. Building
     * the body twice — once to sign, once to send — is how a signature ends up
     * covering a different string than the one on the wire.
     */
    const body = JSON.stringify(row.payload)
    const timestampSeconds = Math.floor(now.getTime() / 1000)

    const headers = deliveryHeaders(
      { id: row.webhookId, url: row.url, secret: row.secret, topics: [], active: true },
      {
        subscriptionId: row.webhookId,
        topic: row.topic as WebhookTopic,
        deliveryId: row.deliveryId,
        payload: row.payload,
      },
      timestampSeconds,
      body,
    )

    let status: number | null = null
    let failure = ''

    try {
      const response = await doFetch(row.url, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      status = response.status
    } catch (err) {
      /*
       * A transport failure — DNS, refused connection, timeout — is a retry
       * rather than a verdict. There is no status code, so `verdictFor` cannot
       * be asked; the retry schedule alone decides whether this attempt was the
       * last one.
       */
      failure = err instanceof Error ? err.message : String(err)
    }

    const verdict =
      status === null
        ? nextRetryDelaySeconds(row.attempts, options.random) === null
          ? 'dead'
          : 'retry'
        : verdictFor(status, row.attempts)

    if (verdict === 'delivered') {
      await store.markDelivered(row.id, status!, now)
      delivered++
      continue
    }

    if (verdict === 'dead') {
      await store.markDead(
        row.id,
        status,
        failure || `HTTP ${status}`,
        now,
      )
      dead++
      log().warn(
        { webhookId: row.webhookId, deliveryId: row.deliveryId, status, attempts: row.attempts },
        'webhook delivery dead-lettered',
      )
      continue
    }

    /*
     * `nextRetryDelaySeconds` cannot be null here — `verdictFor` already
     * returned `dead` in that case — but the fallback is a real number rather
     * than a `!`, because a null reaching `Date` arithmetic produces an
     * `Invalid Date` that the store would happily write as the next attempt,
     * and the delivery would never be claimed again.
     */
    const delay = nextRetryDelaySeconds(row.attempts, options.random) ?? 3600
    await store.scheduleRetry(
      row.id,
      new Date(now.getTime() + delay * 1000),
      status,
      failure || `HTTP ${status}`,
    )
    retried++
  }

  return { attempted: claimed.length, delivered, retried, dead }
}
