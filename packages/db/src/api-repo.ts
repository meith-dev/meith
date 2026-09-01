import { sql } from 'drizzle-orm'

import type { ApiTokenRecord, RateLimitStore, Scope, WebhookFormat, WebhookTopic } from '@meith/api'

import type { Database } from './client'
import { resultRows } from './result-rows'

interface TokenRow {
  id: number
  user_id: number
  name: string
  lookup: string
  secret_hash: string
  scopes: unknown
  expires_at: Date | null
  revoked_at: Date | null
}

function parseScopes(raw: unknown, known: (value: string) => value is Scope): readonly Scope[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is Scope => typeof value === 'string' && known(value))
}

export interface ApiTokenSummary {
  readonly id: number
  readonly userId: number
  readonly username: string
  readonly name: string
  readonly lookup: string
  readonly scopes: readonly Scope[]
  readonly createdAt: Date
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly lastUsedAt: Date | null
}

export class PostgresApiTokenRepository {
  constructor(
    private readonly db: Database,
    private readonly isScope: (value: string) => value is Scope,
  ) {}

  async findByLookup(lookup: string): Promise<ApiTokenRecord | null> {
    const rows = (await this.db.execute(sql`
      select id, user_id, name, lookup, secret_hash, scopes, expires_at, revoked_at
      from api_tokens
      where lookup = ${lookup}
      limit 1
    `)) as unknown as TokenRow[]

    const row = rows[0]
    if (row === undefined) return null

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      lookup: row.lookup,
      secretHash: row.secret_hash,
      scopes: parseScopes(row.scopes, this.isScope),
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    }
  }

  async listAll(limit = 200): Promise<readonly ApiTokenSummary[]> {
    const rows = (await this.db.execute(sql`
      select t.id, t.user_id, u.username, t.name, t.lookup, t.scopes,
             t.created_at, t.expires_at, t.revoked_at, t.last_used_at
      from api_tokens t
      join users u on u.id = t.user_id
      order by t.revoked_at nulls first, t.created_at desc
      limit ${limit}
    `)) as unknown as Array<{
      id: number
      user_id: number
      username: string
      name: string
      lookup: string
      scopes: unknown
      created_at: Date | string
      expires_at: Date | string | null
      revoked_at: Date | string | null
      last_used_at: Date | string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      name: row.name,
      lookup: row.lookup,
      scopes: parseScopes(row.scopes, this.isScope),
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
      revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
      lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at),
    }))
  }

  async create(input: {
    readonly userId: number
    readonly name: string
    readonly lookup: string
    readonly secretHash: string
    readonly scopes: readonly Scope[]
    readonly expiresAt: Date | null
  }): Promise<number> {
    const rows = (await this.db.execute(sql`
      insert into api_tokens (user_id, name, lookup, secret_hash, scopes, expires_at)
      values (${input.userId}, ${input.name}, ${input.lookup}, ${input.secretHash},
              ${JSON.stringify(input.scopes)}, ${input.expiresAt})
      returning id
    `)) as unknown as Array<{ id: number }>

    return rows[0]!.id
  }

  async revoke(id: number, at: Date): Promise<boolean> {
    const rows = (await this.db.execute(sql`
      update api_tokens set revoked_at = ${at}
      where id = ${id} and revoked_at is null
      returning id
    `)) as unknown as Array<{ id: number }>

    return rows.length > 0
  }

  async touch(id: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update api_tokens
      set last_used_at = ${at}
      where id = ${id}
        and (last_used_at is null or last_used_at < ${new Date(at.getTime() - 60_000)})
    `)
  }
}

export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Database) {}

  async spend(tokenId: number, windowStart: Date, cost: number): Promise<number> {
    const rows = (await this.db.execute(sql`
      insert into api_rate_limits (token_id, window_start, used)
      values (${tokenId}, ${windowStart}, ${cost})
      on conflict (token_id, window_start)
        do update set used = api_rate_limits.used + ${cost}
      returning used
    `)) as unknown as { used: number }[]

    return rows[0]?.used ?? cost
  }

  async peek(tokenId: number, windowStart: Date): Promise<number> {
    const rows = (await this.db.execute(sql`
      select used from api_rate_limits
       where token_id = ${tokenId} and window_start = ${windowStart}
    `)) as unknown as { used: number }[]

    return rows[0]?.used ?? 0
  }

  async prune(before: Date, limit = 5000): Promise<number> {
    const rows = (await this.db.execute(sql`
      delete from api_rate_limits
      where ctid in (
        select ctid from api_rate_limits where window_start < ${before} limit ${limit}
      )
      returning token_id
    `)) as unknown as unknown[]
    return rows.length
  }
}

export interface WebhookDeliveryRow {
  readonly id: number
  readonly webhookId: number
  readonly deliveryId: string
  readonly topic: string
  readonly payload: Record<string, unknown>
  readonly attempts: number
  readonly url: string
  readonly secret: string
}

export interface WebhookActiveSubscription {
  readonly id: number
  readonly format: WebhookFormat
}

export interface WebhookSummary {
  readonly id: number
  readonly url: string
  readonly topics: readonly WebhookTopic[]
  readonly active: boolean
  readonly format: WebhookFormat
  readonly createdAt: Date
  readonly delivered: number
  readonly pending: number
  readonly dead: number
}

export interface WebhookDeliveryLogRow {
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

function parseTopics(raw: unknown): readonly WebhookTopic[] {
  return Array.isArray(raw)
    ? (raw.filter((value) => typeof value === 'string') as WebhookTopic[])
    : []
}

function parseFormat(raw: unknown): WebhookFormat {
  return raw === 'discord' ? 'discord' : 'json'
}

export class PostgresWebhookRepository {
  constructor(private readonly db: Database) {}

  async enqueue(
    webhookId: number,
    topic: string,
    deliveryId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
      insert into webhook_deliveries (webhook_id, delivery_id, topic, payload)
      values (${webhookId}, ${deliveryId}, ${topic}, ${JSON.stringify(payload)}::jsonb)
      on conflict (webhook_id, delivery_id) do nothing
      returning id
    `),
    )

    return rows.length > 0
  }

  async listActiveByTopic(topic: string): Promise<readonly WebhookActiveSubscription[]> {
    const rows = resultRows<{ id: number; format: unknown }>(
      await this.db.execute(sql`
      select id, format
      from webhooks
      where active = true and topics ? ${topic}
      order by id
    `),
    )

    return rows.map((row) => ({ id: Number(row.id), format: parseFormat(row.format) }))
  }

  async listAll(limit = 200): Promise<readonly WebhookSummary[]> {
    const rows = resultRows<{
      id: number
      url: string
      topics: unknown
      active: boolean
      format: unknown
      created_at: Date | string
      delivered: number | string
      pending: number | string
      dead: number | string
    }>(
      await this.db.execute(sql`
      select w.id, w.url, w.topics, w.active, w.format, w.created_at,
             count(d.id) filter (where d.status = 'delivered') as delivered,
             count(d.id) filter (where d.status = 'pending') as pending,
             count(d.id) filter (where d.status = 'dead') as dead
      from webhooks w
      left join webhook_deliveries d on d.webhook_id = w.id
      group by w.id
      order by w.created_at desc, w.id desc
      limit ${limit}
    `),
    )

    return rows.map((row) => ({
      id: Number(row.id),
      url: row.url,
      topics: parseTopics(row.topics),
      active: row.active,
      format: parseFormat(row.format),
      createdAt: new Date(row.created_at),
      delivered: Number(row.delivered),
      pending: Number(row.pending),
      dead: Number(row.dead),
    }))
  }

  async recentDeliveries(webhookId: number, limit = 20): Promise<readonly WebhookDeliveryLogRow[]> {
    const rows = resultRows<{
      id: number
      delivery_id: string
      topic: string
      status: string
      attempts: number
      last_status_code: number | null
      last_error: string | null
      created_at: Date | string
      completed_at: Date | string | null
    }>(
      await this.db.execute(sql`
      select id, delivery_id, topic, status, attempts, last_status_code, last_error,
             created_at, completed_at
      from webhook_deliveries
      where webhook_id = ${webhookId}
      order by created_at desc, id desc
      limit ${limit}
    `),
    )

    return rows.map((row) => ({
      id: Number(row.id),
      deliveryId: row.delivery_id,
      topic: row.topic,
      status: row.status,
      attempts: Number(row.attempts),
      lastStatusCode: row.last_status_code === null ? null : Number(row.last_status_code),
      lastError: row.last_error,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at === null ? null : new Date(row.completed_at),
    }))
  }

  async create(input: {
    readonly url: string
    readonly secret: string
    readonly topics: readonly WebhookTopic[]
    readonly active: boolean
    readonly format: WebhookFormat
    readonly createdBy: number | null
  }): Promise<number> {
    const rows = resultRows<{ id: number }>(
      await this.db.execute(sql`
      insert into webhooks (url, secret, topics, active, format, created_by)
      values (${input.url}, ${input.secret}, ${JSON.stringify(input.topics)}::jsonb,
              ${input.active}, ${input.format}, ${input.createdBy})
      returning id
    `),
    )

    return rows[0]!.id
  }

  async setActive(id: number, active: boolean): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
      update webhooks set active = ${active}
      where id = ${id}
      returning id
    `),
    )
    return rows.length > 0
  }

  async remove(id: number): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
      delete from webhooks where id = ${id} returning id
    `),
    )
    return rows.length > 0
  }

  async claimDue(now: Date, limit: number): Promise<readonly WebhookDeliveryRow[]> {
    const rows = resultRows<{
      id: number
      webhook_id: number
      delivery_id: string
      topic: string
      payload: Record<string, unknown>
      attempts: number
      url: string
      secret: string
    }>(
      await this.db.execute(sql`
      with due as (
        select d.id
        from webhook_deliveries d
        where d.status = 'pending' and d.next_attempt_at <= ${now}
        order by d.next_attempt_at
        limit ${limit}
        for update skip locked
      )
      update webhook_deliveries d
      set attempts = d.attempts + 1
      from due, webhooks w
      where d.id = due.id and w.id = d.webhook_id
      returning d.id, d.webhook_id, d.delivery_id, d.topic, d.payload, d.attempts, w.url, w.secret
    `),
    )

    return rows.map((row) => ({
      id: row.id,
      webhookId: row.webhook_id,
      deliveryId: row.delivery_id,
      topic: row.topic,
      payload: row.payload,
      attempts: row.attempts,
      url: row.url,
      secret: row.secret,
    }))
  }

  async markDelivered(id: number, status: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update webhook_deliveries
      set status = 'delivered', last_status_code = ${status}, completed_at = ${at}, last_error = null
      where id = ${id}
    `)
  }

  async scheduleRetry(id: number, at: Date, status: number | null, error: string): Promise<void> {
    await this.db.execute(sql`
      update webhook_deliveries
      set next_attempt_at = ${at}, last_status_code = ${status}, last_error = ${error}
      where id = ${id}
    `)
  }

  async markDead(id: number, status: number | null, error: string, at: Date): Promise<void> {
    await this.db.execute(sql`
      update webhook_deliveries
      set status = 'dead', last_status_code = ${status}, last_error = ${error}, completed_at = ${at}
      where id = ${id}
    `)
  }

  async retryDead(id: number, at: Date): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
      update webhook_deliveries
      set status = 'pending', attempts = 0, next_attempt_at = ${at}, last_error = null
      where id = ${id} and status = 'dead'
      returning id
    `),
    )
    return rows.length > 0
  }
}
