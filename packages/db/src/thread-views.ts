/**
 * F38 — buffered thread views.
 *
 * A view is the cheapest thing a reader can do and the most frequent write the
 * board takes. Applying it directly to `threads.view_count` means every page
 * view updates the row that the R3.5 listing index sorts on, so a thread on the
 * front page produces a stream of dead tuples behind the index that serves the
 * whole community. The buffer turns N views of one thread into one `threads` update
 * per flush.
 *
 * The trade is explicit: an unflushed buffer lost to a database restore loses
 * view counts. That is acceptable for this counter and no other — nothing on
 * the board reads `view_count` for correctness, and unlike post counts it
 * cannot be recomputed from source rows at all, buffered or not.
 */
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export class PostgresThreadViewBuffer {
  constructor(private readonly db: Database) {}

  /**
   * Record one view.
   *
   * A single upsert, and deliberately not wrapped in the caller's transaction:
   * a view is not part of any state change, and joining one would make a
   * contended thread serialise readers behind each other.
   */
  async record(threadId: number): Promise<void> {
    await this.db.execute(sql`
      insert into thread_view_buffer (thread_id, pending, updated_at)
      values (${threadId}, 1, now())
      on conflict (thread_id) do update
        set pending = thread_view_buffer.pending + 1,
            updated_at = now()
    `)
  }

  /**
   * Fold buffered views into `threads.view_count`. Returns threads updated.
   *
   * Bounded per run (invariant 18) and safe against a concurrent flush: the
   * rows are claimed by `DELETE ... FOR UPDATE SKIP LOCKED` in the same
   * statement that applies them, so two overlapping ticks partition the buffer
   * instead of both adding the same pending totals. Deleting rather than
   * zeroing keeps the buffer proportional to *active* threads rather than to
   * every thread ever viewed.
   */
  async flush(limit = 500): Promise<number> {
    const result = await this.db.execute(sql`
      with claimed as (
        delete from thread_view_buffer
         where thread_id in (
           select thread_id from thread_view_buffer
            where pending > 0
            order by updated_at
            limit ${limit}
            for update skip locked
         )
        returning thread_id, pending
      )
      update threads t
         set view_count = t.view_count + c.pending
        from claimed c
       where t.id = c.thread_id
      returning t.id
    `)

    return resultRows(result).length
  }
}
