import { msg } from '@meith/i18n'
import 'server-only'

import {
  generateWebhookSecret,
  isWebhookFormat,
  isWebhookTopic,
  WEBHOOK_FORMATS,
  WEBHOOK_TOPICS,
  type WebhookFormat,
  type WebhookTopic,
} from '@meith/api'
import { ValidationError } from '@meith/core'
import { getDb, PostgresWebhookRepository } from '@meith/db'

import { getContainer } from './container'

export function webhookStore(): PostgresWebhookRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresWebhookRepository(getDb()) : null
}

export interface WebhookDeliveryLogEntry {
  readonly id: number
  readonly deliveryId: string
  readonly topic: string
  readonly status: string
  readonly attempts: number
  readonly lastStatusCode: number | null
  readonly lastError: string | null
  readonly createdAt: Date
  readonly completedAt: Date | null
}

export interface WebhookRow {
  readonly id: number
  readonly url: string
  readonly topics: readonly WebhookTopic[]
  readonly active: boolean
  readonly format: WebhookFormat
  readonly createdAt: Date
  readonly delivered: number
  readonly pending: number
  readonly dead: number
  readonly recent: readonly WebhookDeliveryLogEntry[]
}

export interface WebhookView {
  readonly subscriptions: readonly WebhookRow[]
  readonly topics: readonly WebhookTopic[]
  readonly formats: readonly WebhookFormat[]
}

export async function buildWebhookView(): Promise<WebhookView | null> {
  const store = webhookStore()
  if (store === null) return null

  const summaries = await store.listAll()
  const subscriptions = await Promise.all(
    summaries.map(async (summary) => ({
      id: summary.id,
      url: summary.url,
      topics: summary.topics,
      active: summary.active,
      format: summary.format,
      createdAt: summary.createdAt,
      delivered: summary.delivered,
      pending: summary.pending,
      dead: summary.dead,
      recent: await store.recentDeliveries(summary.id, 10),
    })),
  )

  return { subscriptions, topics: WEBHOOK_TOPICS, formats: WEBHOOK_FORMATS }
}

export interface CreateWebhookInput {
  readonly url: string
  readonly topics: readonly string[]
  readonly format: string
  readonly active: boolean
  readonly createdBy: number | null
}

function validUrl(raw: string): string {
  const url = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ValidationError(msg('error.app.webhook-url-https'))
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError(msg('error.app.webhook-url-https'))
  }
  return url
}

export async function createWebhook(input: CreateWebhookInput): Promise<string> {
  const store = webhookStore()
  if (store === null) throw new ValidationError(msg('error.app.board-database-webhooks'))

  const url = validUrl(input.url)

  const topics = input.topics.filter((topic): topic is WebhookTopic => isWebhookTopic(topic))
  if (topics.length === 0) {
    throw new ValidationError(msg('error.app.webhook-needs-at-least-one-topic'))
  }

  const format: WebhookFormat = isWebhookFormat(input.format) ? input.format : 'json'

  const secret = generateWebhookSecret()
  await store.create({
    url,
    secret,
    topics,
    active: input.active,
    format,
    createdBy: input.createdBy,
  })

  return secret
}
