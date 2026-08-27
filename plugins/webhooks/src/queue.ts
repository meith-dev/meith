import type { PluginData } from '@meith/plugin-kit'

export interface QueuedDelivery {
  readonly id: string
  readonly event: string
  readonly body: string
  readonly attempts: number
}

export interface QueueCounts {
  readonly pending: number
  readonly delivered: number
  readonly dead: number
}

interface DeliveryRow extends Record<string, unknown> {
  readonly id: string | number
  readonly event: string
  readonly body: string
  readonly attempts: number
}

export async function enqueue(data: PluginData, event: string, body: string): Promise<void> {
  await data.query(`insert into plugin_webhooks_delivery (event, body) values ($1, $2)`, [
    event,
    body,
  ])
}

export async function claimDue(
  data: PluginData,
  limit: number,
): Promise<readonly QueuedDelivery[]> {
  const rows = await data.query<DeliveryRow>(
    `update plugin_webhooks_delivery
       set attempts = attempts + 1
     where id in (
       select id from plugin_webhooks_delivery
        where delivered_at is null
          and dead_at is null
          and next_attempt_at <= now()
        order by next_attempt_at
        limit $1
        for update skip locked
     )
     returning id, event, body, attempts`,
    [limit],
  )

  return rows.map((row) => ({
    id: String(row.id),
    event: row.event,
    body: row.body,
    attempts: Number(row.attempts),
  }))
}

export async function markDelivered(data: PluginData, id: string): Promise<void> {
  await data.query(
    `update plugin_webhooks_delivery set delivered_at = now(), last_error = null where id = $1`,
    [id],
  )
}

export async function markRetry(
  data: PluginData,
  id: string,
  delaySeconds: number,
  error: string,
): Promise<void> {
  await data.query(
    `update plugin_webhooks_delivery
        set next_attempt_at = now() + make_interval(secs => $2), last_error = $3
      where id = $1`,
    [id, delaySeconds, error],
  )
}

export async function markDead(data: PluginData, id: string, error: string): Promise<void> {
  await data.query(
    `update plugin_webhooks_delivery set dead_at = now(), last_error = $2 where id = $1`,
    [id, error],
  )
}

export async function counts(data: PluginData): Promise<QueueCounts> {
  const row = await data.one<Record<string, unknown>>(
    `select
       count(*) filter (where delivered_at is null and dead_at is null) as pending,
       count(*) filter (where delivered_at is not null)                 as delivered,
       count(*) filter (where dead_at is not null)                      as dead
     from plugin_webhooks_delivery`,
  )

  return {
    pending: Number(row?.pending ?? 0),
    delivered: Number(row?.delivered ?? 0),
    dead: Number(row?.dead ?? 0),
  }
}
