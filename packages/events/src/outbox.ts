import type { DomainEvent, DomainEventName, OutboxRecord } from './types'

export interface OutboxWriter {
  insertOutbox(rows: Array<{
    name: string
    payload: unknown
    dedupeKey: string | null
  }>): Promise<void>
}

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

export interface OutboxReader {
  claimUnrelayed(limit: number): Promise<OutboxRecord[]>
  markRelayed(ids: number[]): Promise<void>
}

export interface RelayTarget {
  enqueue(jobs: Array<{
    name: string
    payload: unknown
    idempotencyKey: string
  }>): Promise<void>
}

export interface RelayDeps {
  reader: OutboxReader
  target: RelayTarget
  handlerIdsFor(event: DomainEventName): readonly string[]
  batchSize?: number
}

export interface RelayResult {
  claimed: number
  enqueued: number
}

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

  await reader.markRelayed(records.map((r) => r.id))

  return { claimed: records.length, enqueued: jobs.length }
}
