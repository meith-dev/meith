import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export class PostgresThreadViewBuffer {
  constructor(private readonly db: Database) {}

  async record(threadId: number): Promise<void> {
    await this.db.execute(sql`
      insert into thread_view_buffer (thread_id, pending, updated_at)
      values (${threadId}, 1, now())
      on conflict (thread_id) do update
        set pending = thread_view_buffer.pending + 1,
            updated_at = now()
    `)
  }

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
