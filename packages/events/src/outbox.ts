/**
 * F07 — the outbox write side and the relay.
 *
 * Split from `registry.ts` so domain packages can emit without importing handler
 * implementations (which would drag mail/search dependencies into business logic).
 */

import type { DomainEvent, DomainEventName, OutboxRecord } from './types'

/**
 * The subset of a database handle the emitter needs.
 *
 * Deliberately structural rather than importing drizzle's transaction type:
 * `@meith/events` is a domain package and R2 forbids it depending on @meith/db.
 * The app layer passes its real transaction in; the fixture passes an array-backed
 * stand-in. Both satisfy this.
 */
export interface OutboxWriter {
  insertOutbox(rows: Array<{
    name: string
    payload: unknown
    dedupeKey: string | null
  }>): Promise<void>
}

/**
 * Records an event for later delivery.
 *
 * MUST be called with the same transaction handle that wrote the data the event
 * describes. Passing the ambient connection instead silently reintroduces the
 * split-brain failure the outbox exists to prevent — the caller cannot tell the
 * difference, which is why `emit` takes the handle explicitly rather than
 * reaching for a module-level singleton.
 */
export async function emit(tx: OutboxWriter, ...events: DomainEvent[]): Promise<void> {
  if (events.length === 0) return

  await tx.insertOutbox(
    events.map((event) => ({
      name: event.name,
      payload: event.payload,
      dedupeKey: event.dedupeKey ?? null,
    })),
  )
}

/** What the relay needs from storage. Mirrors `OutboxWriter`'s reasoning. */
export interface OutboxReader {
  /**
   * Claims up to `limit` un-relayed rows.
   *
   * Implementations must use `FOR UPDATE SKIP LOCKED` (or equivalent) so two
   * concurrently running relays cannot claim the same row — the relay is
   * triggered by a cron tick that may overlap with itself under load.
   */
  claimUnrelayed(limit: number): Promise<OutboxRecord[]>
  markRelayed(ids: number[]): Promise<void>
}

export interface RelayTarget {
  /**
   * Enqueues one job per (event, handler) pair.
   *
   * `idempotencyKey` is derived from the outbox row id and the handler id, so a
   * relay that crashes after enqueueing but before `markRelayed` re-enqueues the
   * same keys on its next run and the queue discards them. That is what makes
   * at-least-once delivery safe here.
   */
  enqueue(jobs: Array<{
    name: string
    payload: unknown
    idempotencyKey: string
  }>): Promise<void>
}

export interface RelayDeps {
  reader: OutboxReader
  target: RelayTarget
  /** event name -> handler ids listening to it. */
  handlerIdsFor(event: DomainEventName): readonly string[]
  batchSize?: number
}

export interface RelayResult {
  claimed: number
  enqueued: number
}

/**
 * Moves committed events from the outbox onto the queue.
 *
 * Ordering note: rows are marked relayed *after* the enqueue resolves. The
 * reverse order would lose events if the process died in between, and since the
 * enqueue is idempotent, a duplicate relay is harmless while a lost one is not.
 */
export async function relayOutbox({
  reader,
  target,
  handlerIdsFor,
  batchSize = 100,
}: RelayDeps): Promise<RelayResult> {
  const records = await reader.claimUnrelayed(batchSize)
  if (records.length === 0) return { claimed: 0, enqueued: 0 }

  const jobs = records.flatMap((record) =>
    handlerIdsFor(record.name).map((handlerId) => ({
      name: handlerId,
      payload: record.payload,
      idempotencyKey: `outbox:${record.id}:${handlerId}`,
    })),
  )

  if (jobs.length > 0) {
    await target.enqueue(jobs)
  }

  /*
   * Rows with no registered handler are still marked relayed. Leaving them
   * un-relayed would make the relay re-read them on every tick forever, and an
   * event nobody listens to is not an error — handlers are registered per
   * deployment and a feature may be switched off.
   */
  await reader.markRelayed(records.map((r) => r.id))

  return { claimed: records.length, enqueued: jobs.length }
}
