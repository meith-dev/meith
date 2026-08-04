/**
 * F81 — the stores behind the public API and its webhooks.
 *
 * Three repositories, each with exactly one interesting statement in it.
 */

import { sql } from 'drizzle-orm'

import type { Database } from './client'

import type { ApiTokenRecord, RateLimitStore, Scope } from '@meith/api'

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

/** Scopes arrive as JSON. An unrecognised one is dropped rather than trusted. */
function parseScopes(raw: unknown, known: (value: string) => value is Scope): readonly Scope[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is Scope => typeof value === 'string' && known(value))
}

/** A token as the operator screen lists it. Never carries the secret hash. */
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
    /*
     * The lookup is the *clear* half and is unique-indexed, so this is one
     * index probe. The secret is never compared in SQL — a `where secret_hash =`
     * would compare in the database, which is neither constant-time nor
     * something the query log should ever contain.
     */
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

  /**
   * Every token on the board, for the operator screen (F81).
   *
   * **The secret hash is not selected.** It has no use on a listing and the
   * screen renders whatever it is given; leaving it out of the query means a
   * future template change cannot put it on a page. The lookup half *is*
   * shown — it is the clear prefix a member can match against their own copy,
   * which is how somebody identifies which token to revoke.
   */
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
      created_at: Date
      expires_at: Date | null
      revoked_at: Date | null
      last_used_at: Date | null
    }>

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      name: row.name,
      lookup: row.lookup,
      scopes: parseScopes(row.scopes, this.isScope),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
    }))
  }

  /**
   * Store an issued token.
   *
   * Takes the *hash*, never the secret: the caller does the hashing so this
   * class has no opportunity to log, return or accidentally persist the clear
   * value. The clear token exists exactly once, in the response that mints it.
   */
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

  /**
   * Revoke, idempotently and without deleting.
   *
   * The row stays so `last_used_at` and the name survive an incident review —
   * "which token was that, and when was it last used" is the first question
   * asked after one leaks, and a DELETE answers none of it. Revoking twice is
   * not an error: the operator clicking again during an incident should not see
   * a failure.
   */
  async revoke(id: number, at: Date): Promise<boolean> {
    const rows = (await this.db.execute(sql`
      update api_tokens set revoked_at = ${at}
      where id = ${id} and revoked_at is null
      returning id
    `)) as unknown as Array<{ id: number }>

    return rows.length > 0
  }

  /**
   * Record use, at most once a minute.
   *
   * The throttle is in the `where` clause rather than in a read-then-write,
   * which is the same shape `touchActivity` and `touchLocation` use: an API
   * under load must not also be a write per request, and a conditional UPDATE
   * that usually matches nothing costs an index probe.
   */
  async touch(id: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update api_tokens
      set last_used_at = ${at}
      where id = ${id}
        and (last_used_at is null or last_used_at < ${new Date(at.getTime() - 60_000)})
    `)
  }
}

/**
 * The rate-limit window store.
 *
 * **The check is the write.** One statement: insert the window row or add to
 * it, and return the total afterwards. A `select` followed by an `update` is
 * two statements with a gap in the middle, and API traffic is precisely the
 * traffic that arrives twenty requests at once — every one of them reading the
 * same under-budget total.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Database) {}

  async consume(tokenId: number, windowStart: Date, cost: number): Promise<number> {
    const rows = (await this.db.execute(sql`
      insert into api_rate_limits (token_id, window_start, used)
      values (${tokenId}, ${windowStart}, ${cost})
      on conflict (token_id, window_start)
        do update set used = api_rate_limits.used + ${cost}
      returning used
    `)) as unknown as { used: number }[]

    return rows[0]?.used ?? cost
  }

  /** Windows older than an hour are history nobody reads. Bounded, per F70. */
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

export class PostgresWebhookRepository {
  constructor(private readonly db: Database) {}

  /**
   * Queue one delivery per subscription interested in the topic.
   *
   * `on conflict do nothing` against `(webhook_id, delivery_id)` is what makes
   * the *emitter* idempotent: the relay drains the outbox at least once (F07),
   * so the same event can arrive twice, and without this a subscriber would get
   * two deliveries with different ids and no way to tell they were one event.
   */
  async enqueue(
    topic: string,
    deliveryId: string,
    payload: Record<string, unknown>,
  ): Promise<number> {
    const rows = (await this.db.execute(sql`
      insert into webhook_deliveries (webhook_id, delivery_id, topic, payload)
      select w.id, ${deliveryId}, ${topic}, ${JSON.stringify(payload)}::jsonb
      from webhooks w
      where w.active = true and w.topics ? ${topic}
      on conflict (webhook_id, delivery_id) do nothing
      returning id
    `)) as unknown as unknown[]

    return rows.length
  }

  /**
   * Claim due deliveries.
   *
   * `for update skip locked` because the worker may run in more than one place
   * — the standalone image and a Vercel cron can both be pointed at the same
   * database, and two workers claiming the same row would send one event twice.
   */
  async claimDue(now: Date, limit: number): Promise<readonly WebhookDeliveryRow[]> {
    const rows = (await this.db.execute(sql`
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
    `)) as unknown as {
      id: number
      webhook_id: number
      delivery_id: string
      topic: string
      payload: Record<string, unknown>
      attempts: number
      url: string
      secret: string
    }[]

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

  /** The dead letter: kept, not dropped, so an operator can retry it later. */
  async markDead(id: number, status: number | null, error: string, at: Date): Promise<void> {
    await this.db.execute(sql`
      update webhook_deliveries
      set status = 'dead', last_status_code = ${status}, last_error = ${error}, completed_at = ${at}
      where id = ${id}
    `)
  }

  /** Put a dead delivery back in the queue. The operator's undo. */
  async retryDead(id: number, at: Date): Promise<boolean> {
    const rows = (await this.db.execute(sql`
      update webhook_deliveries
      set status = 'pending', attempts = 0, next_attempt_at = ${at}, last_error = null
      where id = ${id} and status = 'dead'
      returning id
    `)) as unknown as unknown[]
    return rows.length > 0
  }
}
