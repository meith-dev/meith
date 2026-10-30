import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { DomainEventName, OutboxReader, OutboxRecord } from '@meith/events'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { outbox } from './schema'

const MAX_CLAIMS = 10

export class PostgresOutboxReader implements OutboxReader {
  constructor(private readonly db: Database) {}

  async claimUnrelayed(limit: number): Promise<OutboxRecord[]> {
    const result = await this.db.execute(sql`
      update ${outbox}
         set attempts = ${outbox.attempts} + 1,
             locked_until = now() + interval '5 minutes',
             claim_token = ${randomUUID()}
       where id in (
         select id from ${outbox}
          where dispatched_at is null
            and attempts < ${MAX_CLAIMS}
            and (locked_until is null or locked_until <= now())
          order by id
          limit ${limit}
          for update skip locked
       )
      returning id, topic, payload, created_at, dispatched_at, claim_token
    `)

    return (
      resultRows(result) as Array<{
        id: number
        claim_token: string | null
        topic: string
        payload: unknown
        created_at: Date | string
        dispatched_at: Date | string | null
      }>
    ).map((row) => ({
      id: Number(row.id),
      claimToken: row.claim_token,
      name: row.topic as DomainEventName,
      payload: row.payload,
      dedupeKey: null,
      createdAt: new Date(row.created_at),
      relayedAt: row.dispatched_at === null ? null : new Date(row.dispatched_at),
    }))
  }

  async markRelayed(records: readonly OutboxRecord[]): Promise<void> {
    if (records.length === 0) return
    const claims = sql.join(
      records.map((row) => sql`(${row.id}::int, ${row.claimToken}::text)`),
      sql`, `,
    )
    await this.db.execute(sql`
      update outbox o set dispatched_at = now(), locked_until = null, claim_token = null
      from (values ${claims}) as claim(id, token)
      where o.id = claim.id and o.claim_token = claim.token and o.dispatched_at is null
    `)
  }

  async stuck(limit = 50): Promise<OutboxRecord[]> {
    const rows = await this.db.execute(sql`
      select id, topic, payload, created_at, dispatched_at, claim_token
        from ${outbox}
       where dispatched_at is null and attempts >= ${MAX_CLAIMS}
         and (locked_until is null or locked_until <= now())
       order by id
       limit ${limit}
    `)

    return (
      resultRows(rows) as Array<{
        id: number
        claim_token: string | null
        topic: string
        payload: unknown
        created_at: Date | string
        dispatched_at: Date | string | null
      }>
    ).map((row) => ({
      id: Number(row.id),
      claimToken: row.claim_token,
      name: row.topic as DomainEventName,
      payload: row.payload,
      dedupeKey: null,
      createdAt: new Date(row.created_at),
      relayedAt: row.dispatched_at === null ? null : new Date(row.dispatched_at),
    }))
  }
}
