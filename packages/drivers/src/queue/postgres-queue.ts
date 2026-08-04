/**
 * The default queue: a `jobs` table drained with `FOR UPDATE SKIP LOCKED`.
 *
 * Chosen over Redis as the default because it needs no extra infrastructure and
 * it enqueues inside the same transaction as the state change that caused it —
 * which is what makes the outbox (F07) reliable rather than best-effort.
 */

import { randomUUID } from 'node:crypto'

import { type Job, type EnqueueOptions, type QueueDriver, logger } from '@meith/core'
import { getDb, jobs, type Database, resultRows } from '@meith/db'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'

/**
 * How long a claimed job stays invisible to other workers.
 *
 * This is a *lease*, not a timeout: the claiming worker may die (serverless
 * function killed mid-execution), and the job must eventually become claimable
 * again. It therefore has to exceed the longest plausible handler runtime, or a
 * slow-but-healthy job gets picked up a second time while still running. 5
 * minutes comfortably exceeds the Vercel function limit.
 */
const LEASE_SECONDS = 300

/** Exponential backoff, capped. attempt 1 -> 10s, 2 -> 40s, 3 -> 90s ... */
function backoffSeconds(attempt: number): number {
  return Math.min(10 * attempt * attempt, 3600)
}

export class PostgresQueue implements QueueDriver {
  /**
   * Identifies this worker in `locked_by`. Purely diagnostic — correctness comes
   * from the row lock, not from this value — but it makes a stuck lease
   * traceable to a specific process.
   */
  private readonly workerId = `${process.pid}-${randomUUID().slice(0, 8)}`

  constructor(private readonly db: Database = getDb()) {}

  async enqueue<TPayload>(
    kind: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<{ id: string; deduplicated: boolean }> {
    const row = {
      kind,
      payload: payload as never,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 5,
      idempotencyKey: options.dedupeKey ?? null,
    }

    /*
     * With a dedupe key, rely on the partial unique index over pending jobs
     * rather than a SELECT-then-INSERT: the check-then-act version races two
     * concurrent enqueues straight through the gap and produces duplicates.
     * ON CONFLICT DO NOTHING returns no row when it collides, which is how we
     * detect deduplication.
     */
    if (options.dedupeKey) {
      const inserted = await this.db
        .insert(jobs)
        .values(row)
        .onConflictDoNothing()
        .returning({ id: jobs.id })

      const first = inserted[0]
      if (!first) {
        const existing = await this.db
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(eq(jobs.idempotencyKey, options.dedupeKey), eq(jobs.status, 'pending')),
          )
          .limit(1)

        return { id: String(existing[0]?.id ?? ''), deduplicated: true }
      }
      return { id: String(first.id), deduplicated: false }
    }

    const inserted = await this.db.insert(jobs).values(row).returning({ id: jobs.id })
    return { id: String(inserted[0]!.id), deduplicated: false }
  }

  async drain(
    limit: number,
    handler: (job: Job) => Promise<void>,
  ): Promise<{ processed: number; failed: number }> {
    const claimed = await this.claim(limit)

    let processed = 0
    let failed = 0

    for (const job of claimed) {
      try {
        await handler(job)
        await this.db
          .update(jobs)
          .set({ status: 'done', completedAt: new Date(), lockedUntil: null, lockedBy: null })
          .where(eq(jobs.id, Number(job.id)))
        processed += 1
      } catch (error) {
        failed += 1
        await this.recordFailure(job, error)
      }
    }

    return { processed, failed }
  }

  /**
   * Atomically claims up to `limit` due jobs.
   *
   * The subquery takes `FOR UPDATE SKIP LOCKED`, so two concurrent drains
   * partition the available rows instead of blocking on each other or — far
   * worse — both returning the same row. Doing this as a single
   * `UPDATE ... RETURNING` rather than SELECT-then-UPDATE is what closes the
   * window: between a separate select and update, another worker can claim the
   * same job, and F05 requires a concurrent double-drain never double-process.
   */
  private async claim(limit: number): Promise<Job[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000)

    const rows = await this.db.execute(sql`
      UPDATE ${jobs}
         SET status       = 'running',
             attempts     = ${jobs.attempts} + 1,
             locked_until = ${leaseUntil},
             locked_by    = ${this.workerId}
       WHERE id IN (
         SELECT id
           FROM ${jobs}
          WHERE run_at <= ${now}
            AND (
              status = 'pending'
              -- Reclaim rows whose lease expired: the worker holding them died.
              OR (status = 'running' AND locked_until < ${now})
            )
            AND attempts < max_attempts
          ORDER BY run_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, kind, payload, attempts, correlation_id
    `)

    return resultRows(rows).map((r) => {
      const job: Job = {
        id: String(r.id),
        kind: String(r.kind),
        payload: r.payload,
        attempt: Number(r.attempts),
      }
      const correlationId = r.correlation_id
      return typeof correlationId === 'string'
        ? { ...job, requestId: correlationId }
        : job
    })
  }

  private async recordFailure(job: Job, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    const exhausted = await this.isExhausted(job)

    await this.db
      .update(jobs)
      .set({
        // Dead-lettered jobs are terminal; anything else goes back with backoff.
        status: exhausted ? 'dead' : 'pending',
        lastError: message.slice(0, 2000),
        runAt: new Date(Date.now() + backoffSeconds(job.attempt) * 1000),
        lockedUntil: null,
        lockedBy: null,
      })
      .where(eq(jobs.id, Number(job.id)))

    logger({ jobId: job.id, kind: job.kind, attempt: job.attempt }).error(
      { err: message },
      exhausted ? 'job dead-lettered' : 'job failed, will retry',
    )
  }

  private async isExhausted(job: Job): Promise<boolean> {
    const rows = await this.db
      .select({ attempts: jobs.attempts, maxAttempts: jobs.maxAttempts })
      .from(jobs)
      .where(eq(jobs.id, Number(job.id)))
      .limit(1)

    const row = rows[0]
    return row ? row.attempts >= row.maxAttempts : true
  }

  async deadLettered(limit: number): Promise<readonly Job[]> {
    const rows = await this.db
      .select({
        id: jobs.id,
        kind: jobs.kind,
        payload: jobs.payload,
        attempts: jobs.attempts,
      })
      .from(jobs)
      .where(eq(jobs.status, 'dead'))
      .limit(limit)

    return rows.map((r) => ({
      id: String(r.id),
      kind: r.kind,
      payload: r.payload,
      attempt: r.attempts,
    }))
  }

  async retry(jobId: string): Promise<void> {
    await this.db
      .update(jobs)
      .set({
        status: 'pending',
        // Reset attempts so the operator gets a full retry budget, not one try.
        attempts: 0,
        runAt: new Date(),
        lastError: null,
        lockedUntil: null,
        lockedBy: null,
      })
      .where(and(eq(jobs.id, Number(jobId)), eq(jobs.status, 'dead')))
  }

  /** Rows eligible for cleanup by the daily maintenance task. */
  static completedBefore(cutoff: Date) {
    return and(
      eq(jobs.status, 'done'),
      or(isNull(jobs.completedAt), lt(jobs.completedAt, cutoff)),
    )
  }
}
