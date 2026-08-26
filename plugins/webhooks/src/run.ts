import type { PluginData, PluginRuntimeContext } from '@meith/plugin-kit'

import { isDeliverable, resolveWebhooksConfig, type WebhooksConfig } from './config'
import { describeFailure, nextDelaySeconds, verdictFor } from './delivery'
import { claimDue, markDead, markDelivered, markRetry, type QueuedDelivery } from './queue'
import { deliveryHeaders } from './signature'

export const BATCH_SIZE = 20

export const REQUEST_TIMEOUT_MS = 10_000

export interface DeliveryDeps {
  readonly fetchImpl?: typeof fetch | undefined
  readonly nowSeconds?: (() => number) | undefined
}

export interface DeliveryOutcome {
  readonly attempted: number
  readonly delivered: number
  readonly retried: number
  readonly dead: number
}

async function send(
  row: QueuedDelivery,
  config: WebhooksConfig,
  deps: DeliveryDeps,
): Promise<{ status: number | null; detail: string }> {
  const doFetch = deps.fetchImpl ?? fetch
  const nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000))

  try {
    const response = await doFetch(config.endpointUrl, {
      method: 'POST',
      headers: deliveryHeaders({
        event: row.event,
        body: row.body,
        secret: config.signingSecret,
        timestampSeconds: nowSeconds(),
      }),
      body: row.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (response.ok) return { status: response.status, detail: '' }
    return { status: response.status, detail: await response.text().catch(() => '') }
  } catch (error) {
    return { status: null, detail: error instanceof Error ? error.message : String(error) }
  }
}

export async function deliverBatch(
  context: PluginRuntimeContext,
  deps: DeliveryDeps = {},
): Promise<DeliveryOutcome> {
  const config = resolveWebhooksConfig(context.settings)
  if (!isDeliverable(config)) return { attempted: 0, delivered: 0, retried: 0, dead: 0 }

  const data: PluginData = context.data
  const rows = await claimDue(data, BATCH_SIZE)

  let delivered = 0
  let retried = 0
  let dead = 0

  for (const row of rows) {
    const { status, detail } = await send(row, config, deps)
    const verdict = verdictFor(status, row.attempts)

    if (verdict === 'delivered') {
      await markDelivered(data, row.id)
      delivered += 1
      continue
    }

    const error = describeFailure(status, detail)

    if (verdict === 'dead') {
      await markDead(data, row.id, error)
      dead += 1
      continue
    }

    await markRetry(data, row.id, nextDelaySeconds(row.attempts), error)
    retried += 1
  }

  return { attempted: rows.length, delivered, retried, dead }
}
