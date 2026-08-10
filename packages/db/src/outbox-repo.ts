import { inArray, sql } from 'drizzle-orm'

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
         set attempts = ${outbox.attempts} + 1
       where id in (
         select id from ${outbox}
          where dispatched_at is null
            and attempts < ${MAX_CLAIMS}
          order by id
          limit ${limit}
          for update skip locked
       )
      returning id, topic, payload, created_at, dispatched_at
    `)

    return (
      resultRows(result) as Array<{
        id: number
        topic: string
        payload: unknown
        created_at: Date | string
        dispatched_at: Date | string | null
      }>
    ).map((row) => ({
      id: Number(row.id),
      name: row.topic as DomainEventName,
      payload: row.payload,
      dedupeKey: null,
      createdAt: new Date(row.created_at),
      relayedAt: row.dispatched_at === null ? null : new Date(row.dispatched_at),
    }))
  }

  async markRelayed(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    await this.db
      .update(outbox)
      .set({ dispatchedAt: new Date() })
      .where(inArray(outbox.id, ids))
  }

  async stuck(limit = 50): Promise<OutboxRecord[]> {
    const rows = await this.db.execute(sql`
      select id, topic, payload, created_at, dispatched_at
        from ${outbox}
       where dispatched_at is null and attempts >= ${MAX_CLAIMS}
       order by id
       limit ${limit}
    `)

    return (
      resultRows(rows) as Array<{
        id: number
        topic: string
        payload: unknown
        created_at: Date | string
        dispatched_at: Date | string | null
      }>
    ).map((row) => ({
      id: Number(row.id),
      name: row.topic as DomainEventName,
      payload: row.payload,
      dedupeKey: null,
      createdAt: new Date(row.created_at),
      relayedAt: row.dispatched_at === null ? null : new Date(row.dispatched_at),
    }))
  }
}
