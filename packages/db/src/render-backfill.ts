/**
 * F36 — rewriting stored renders that are no longer current.
 *
 * The read path never depends on this having run: a post whose stored HTML is
 * missing or produced by an older renderer is rendered live. What this removes
 * is the *cost* of that, and it is deliberately the least clever component in
 * the counter/backfill family:
 *
 *   - **No cursor.** Unlike F38's recount, "what is left to do" is a predicate
 *     on the row itself (`render_version <> current`), not a position in a
 *     scan. A run that dies halfway leaves the rows it did not reach exactly as
 *     stale as they were, and the next run finds them by asking the same
 *     question. There is no state to keep and none to corrupt.
 *   - **Safe to run twice at once.** Two overlapping runs claim the same rows
 *     and write the same bytes, because the render is a pure function of the
 *     message. The worst outcome is wasted work.
 *   - **Bounded.** One `select` and one `update` per run regardless of batch
 *     size, so a 2M-post board is thousands of short runs rather than one that
 *     cannot finish inside a serverless invocation (invariant 18).
 *
 * The version is written from `RENDER_VERSION` at the moment of rendering,
 * never assumed: a deploy that lands mid-sweep must not stamp the new version
 * onto HTML the old renderer produced.
 */
import { sql } from 'drizzle-orm'

import { RENDER_VERSION, renderBBCode } from '@forum/bbcode'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface RenderBackfillRun {
  /** Posts rewritten in this run. Fewer than the batch means caught up. */
  readonly rendered: number
}

export class PostgresRenderBackfill {
  constructor(private readonly db: Database) {}

  /** How many posts are still on an older renderer. For System Health (F70). */
  async pending(): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as pending
          from posts
         where render_version <> ${RENDER_VERSION}
      `),
    ) as Array<{ pending: number }>
    return Number(rows[0]?.pending ?? 0)
  }

  async run(batchSize: number): Promise<RenderBackfillRun> {
    if (batchSize <= 0) return { rendered: 0 }

    const stale = resultRows(
      await this.db.execute(sql`
        select id, message
          from posts
         where render_version <> ${RENDER_VERSION}
         order by id
         limit ${batchSize}
      `),
    ) as Array<{ id: number; message: string }>

    if (stale.length === 0) return { rendered: 0 }

    const rendered = stale.map((row) => ({
      id: Number(row.id),
      html: renderBBCode(row.message).html,
    }))

    /*
     * One statement for the batch. The alternative — an update per post — is
     * the same work spread over `batchSize` round trips, which on a pooled
     * serverless connection is what turns a 200-post batch into a run that
     * spends its budget on latency.
     */
    const values = sql.join(
      rendered.map((row) => sql`(${row.id}::int, ${row.html}::text)`),
      sql`, `,
    )
    await this.db.execute(sql`
      update posts as p
         set message_html = v.html, render_version = ${RENDER_VERSION}
        from (values ${values}) as v(id, html)
       where p.id = v.id
    `)

    return { rendered: rendered.length }
  }
}
