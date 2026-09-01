import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const WEBHOOK_SECRET_PREFIX = 'whsec_'

export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString('base64url')}`
}

export const SIGNATURE_HEADER = 'x-forum-signature'
export const TIMESTAMP_HEADER = 'x-forum-timestamp'
export const EVENT_HEADER = 'x-forum-event'
export const DELIVERY_HEADER = 'x-forum-delivery'

export const REPLAY_TOLERANCE_SECONDS = 300

export const MAX_ATTEMPTS = 6

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

export function signPayload(secret: string, timestampSeconds: number, body: string): string {
  const mac = createHmac('sha256', secret)
  mac.update(`${timestampSeconds}.${body}`, 'utf8')
  return `sha256=${mac.digest('hex')}`
}

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

export function deliveryHeaders(
  subscription: WebhookSubscription,
  delivery: WebhookDelivery,
  timestampSeconds: number,
  body: string,
): Record<string, string> {
  return {
    'content-type': 'application/json',
    [EVENT_HEADER]: delivery.topic,
    [DELIVERY_HEADER]: delivery.deliveryId,
    [TIMESTAMP_HEADER]: String(timestampSeconds),
    [SIGNATURE_HEADER]: signPayload(subscription.secret, timestampSeconds, body),
  }
}

export function nextRetryDelaySeconds(
  attempt: number,
  random: () => number = Math.random,
): number | null {
  if (attempt >= MAX_ATTEMPTS) return null

  const base = Math.min(30 * 2 ** (attempt - 1), 3600)
  const jitter = 1 + (random() - 0.5) / 2
  return Math.round(base * jitter)
}

export type DeliveryVerdict = 'delivered' | 'retry' | 'dead'

export function verdictFor(status: number, attempt: number): DeliveryVerdict {
  if (status >= 200 && status < 300) return 'delivered'
  if (status === 410) return 'dead'
  return nextRetryDelaySeconds(attempt) === null ? 'dead' : 'retry'
}

export const WEBHOOK_FORMATS = ['json', 'discord'] as const

export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number]

export function isWebhookFormat(value: string): value is WebhookFormat {
  return (WEBHOOK_FORMATS as readonly string[]).includes(value)
}

export function webhookEventUrl(
  boardUrl: string,
  topic: WebhookTopic,
  ids: Readonly<Record<string, unknown>>,
): string | null {
  const base = boardUrl.replace(/\/+$/, '')
  if (base === '') return null

  const threadId = ids.threadId
  const postId = ids.postId

  if (topic === 'thread.created' && typeof threadId === 'number') {
    return `${base}/threads/${threadId}`
  }
  if (
    (topic === 'post.created' || topic === 'post.edited' || topic === 'post.deleted') &&
    typeof threadId === 'number' &&
    typeof postId === 'number'
  ) {
    return `${base}/threads/${threadId}#post-${postId}`
  }
  return null
}

export function formatWebhookPayload(
  topic: WebhookTopic,
  ids: Readonly<Record<string, unknown>>,
  format: WebhookFormat,
  boardUrl: string,
): Record<string, unknown> {
  const url = webhookEventUrl(boardUrl, topic, ids)

  if (format === 'discord') {
    const base = boardUrl.replace(/\/+$/, '')
    return { content: url ?? (base === '' ? topic : `${topic} — ${base}`) }
  }

  return { event: topic, ...ids, ...(url === null ? {} : { url }) }
}
