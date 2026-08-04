/**
 * In-heap queue for tests, the fixture data source and single-process dev.
 *
 * Rejected in production by env validation: jobs live in the heap, so every cold
 * start would silently discard pending work. It exists so the contract suite and
 * domain tests can exercise queue behaviour without a database.
 */

import { randomUUID } from 'node:crypto'

import type { EnqueueOptions, Job, QueueDriver } from '@meith/core'

interface Row {
  id: string
  kind: string
  payload: unknown
  runAt: number
  attempts: number
  maxAttempts: number
  status: 'pending' | 'running' | 'done' | 'dead'
  dedupeKey?: string
  lastError?: string
}

export class MemoryQueue implements QueueDriver {
  private rows: Row[] = []

  /**
   * Mirrors PostgresQueue's backoff so a test asserting retry timing behaves the
   * same against either driver.
   */
  private backoffMs(attempt: number): number {
    return Math.min(10 * attempt * attempt, 3600) * 1000
  }

  enqueue<TPayload>(
    kind: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<{ id: string; deduplicated: boolean }> {
    if (options.dedupeKey) {
      const live = this.rows.find(
        (r) => r.dedupeKey === options.dedupeKey && r.status === 'pending',
      )
      if (live) return Promise.resolve({ id: live.id, deduplicated: true })
    }

    const row: Row = {
      id: randomUUID(),
      kind,
      payload,
      runAt: options.runAt?.getTime() ?? Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 5,
      status: 'pending',
    }
    if (options.dedupeKey) row.dedupeKey = options.dedupeKey

    this.rows.push(row)
    return Promise.resolve({ id: row.id, deduplicated: false })
  }

  async drain(
    limit: number,
    handler: (job: Job) => Promise<void>,
  ): Promise<{ processed: number; failed: number }> {
    const now = Date.now()

    /*
     * Claim by flipping status *before* awaiting anything. JS is single-threaded
     * up to the first await, so this is atomic in the same sense the SQL claim
     * is — two interleaved drains cannot both see the same pending row.
     */
    const claimed = this.rows
      .filter((r) => r.status === 'pending' && r.runAt <= now && r.attempts < r.maxAttempts)
      .slice(0, limit)

    for (const row of claimed) {
      row.status = 'running'
      row.attempts += 1
    }

    let processed = 0
    let failed = 0

    for (const row of claimed) {
      try {
        await handler({
          id: row.id,
          kind: row.kind,
          payload: row.payload,
          attempt: row.attempts,
        })
        row.status = 'done'
        processed += 1
      } catch (error) {
        failed += 1
        row.lastError = error instanceof Error ? error.message : String(error)
        row.status = row.attempts >= row.maxAttempts ? 'dead' : 'pending'
        row.runAt = Date.now() + this.backoffMs(row.attempts)
      }
    }

    return { processed, failed }
  }

  deadLettered(limit: number): Promise<readonly Job[]> {
    return Promise.resolve(
      this.rows
        .filter((r) => r.status === 'dead')
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          payload: r.payload,
          attempt: r.attempts,
        })),
    )
  }

  retry(jobId: string): Promise<void> {
    const row = this.rows.find((r) => r.id === jobId && r.status === 'dead')
    if (row) {
      row.status = 'pending'
      row.attempts = 0
      row.runAt = Date.now()
      delete row.lastError
    }
    return Promise.resolve()
  }

  /* ---- test helpers, not part of QueueDriver ---- */

  /** Total rows regardless of status. */
  size(): number {
    return this.rows.length
  }

  pending(): readonly Job[] {
    return this.rows
      .filter((r) => r.status === 'pending')
      .map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, attempt: r.attempts }))
  }

  reset(): void {
    this.rows = []
  }
}
