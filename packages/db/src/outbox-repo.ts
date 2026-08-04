/**
 * Postgres implementation of `OutboxReader` (F07).
 *
 * The relay is the step that turns a committed event into queued work. Until it
 * existed, `applyCreatedContentCounters` wrote a `post.created` row that nothing
 * ever read — the ancestor roll-up (F38) is its first consumer.
 */
import { inArray, sql } from 'drizzle-orm'

import type { DomainEventName, OutboxReader, OutboxRecord } from '@meith/events'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { outbox } from './schema'

/**
 * Claims after which an event is left alone.
 *
 * A row is claimed by bumping `attempts`, so an event that keeps killing the
 * relay stops being claimed instead of blocking every event behind it forever.
 * It stays in the table, undispatched and visible to the operator, which is the
 * outbox's version of a dead letter.
 */
const MAX_CLAIMS = 10

export class PostgresOutboxReader implements OutboxReader {
  constructor(private readonly db: Database) {}

  /**
   * Claim up to `limit` undispatched events, oldest first.
   *
   * `FOR UPDATE SKIP LOCKED` inside the same statement that bumps `attempts`
   * means two overlapping relays partition the backlog rather than both
   * claiming the same rows. It does not make delivery exactly-once, and it is
   * not trying to: the row is only marked dispatched after the enqueue
   * succeeds, so a relay that dies in between re-claims the event on its next
   * run. That is the at-least-once contract every handler downstream is
   * written against — the roll-up carries its own ledger for exactly this
   * reason.
   */
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
        created_at: Date
        dispatched_at: Date | null
      }>
    ).map((row) => ({
      id: Number(row.id),
      name: row.topic as DomainEventName,
      payload: row.payload,
      /* The table predates dedupe keys; the queue's idempotency key covers the
       * same ground for relayed work, so there is nothing to reconstruct. */
      dedupeKey: null,
      createdAt: row.created_at,
      relayedAt: row.dispatched_at,
    }))
  }

  async markRelayed(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    await this.db
      .update(outbox)
      .set({ dispatchedAt: new Date() })
      .where(inArray(outbox.id, ids))
  }

  /** Events that exhausted their claims. For the CLI and F70's health screen. */
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
        created_at: Date
        dispatched_at: Date | null
      }>
    ).map((row) => ({
      id: Number(row.id),
      name: row.topic as DomainEventName,
      payload: row.payload,
      dedupeKey: null,
      createdAt: row.created_at,
      relayedAt: row.dispatched_at,
    }))
  }
}
