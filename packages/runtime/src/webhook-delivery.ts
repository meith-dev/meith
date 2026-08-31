import { deliveryHeaders, nextRetryDelaySeconds, verdictFor, type WebhookTopic } from '@meith/api'
import { env, isProduction, logger } from '@meith/core'
import { assertAllowedUrl, BlockedOutboundError, guardedRequest } from '@meith/core/outbound'

export interface ClaimedDelivery {
  readonly id: number
  readonly webhookId: number
  readonly deliveryId: string
  readonly topic: string
  readonly payload: Record<string, unknown>
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

export const REQUEST_TIMEOUT_MS = 10_000

export interface DeliverWebhooksResult {
  readonly attempted: number
  readonly delivered: number
  readonly retried: number
  readonly dead: number
}

export interface DeliveryAttempt {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export type DeliverAttemptFn = (attempt: DeliveryAttempt) => Promise<{ readonly status: number }>

export interface DeliverWebhooksOptions {
  readonly now?: Date
  readonly random?: () => number
  readonly deliver?: DeliverAttemptFn
}

export function webhookAllowsPrivateHosts(): boolean {
  return env.WEBHOOK_ALLOW_PRIVATE_HOSTS || !isProduction()
}

const guardedDelivery: DeliverAttemptFn = async (attempt) => {
  const allowPrivateHosts = webhookAllowsPrivateHosts()
  const url = assertAllowedUrl(attempt.url, { allowPrivateHosts })
  const { status } = await guardedRequest({
    url,
    method: 'POST',
    headers: attempt.headers,
    body: attempt.body,
    timeoutMs: REQUEST_TIMEOUT_MS,
    allowPrivateHosts,
  })
  return { status }
}

export async function deliverWebhooks(
  store: WebhookDeliveryStore,
  limit: number,
  options: DeliverWebhooksOptions = {},
): Promise<DeliverWebhooksResult> {
  const now = options.now ?? new Date()
  const deliver = options.deliver ?? guardedDelivery
  const log = () => logger({ module: 'webhooks' })

  const claimed = await store.claimDue(now, limit)
  let delivered = 0
  let retried = 0
  let dead = 0

  for (const row of claimed) {
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
    let blocked = false

    try {
      const response = await deliver({ url: row.url, headers, body })
      status = response.status
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
      blocked = err instanceof BlockedOutboundError
    }

    const verdict = blocked
      ? 'dead'
      : status === null
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
      await store.markDead(row.id, status, failure || `HTTP ${status}`, now)
      dead++
      log().warn(
        { webhookId: row.webhookId, deliveryId: row.deliveryId, status, attempts: row.attempts },
        'webhook delivery dead-lettered',
      )
      continue
    }

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
