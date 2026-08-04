/**
 * F36 — rewriting stored renders that are no longer current, and converting the
 * bodies that are not Markdown yet.
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
 *
 * ## The one thing here that is not idempotent, and how it is made so
 *
 * This is also where a board's BBCode becomes Markdown. Converting a body
 * *twice* would escape its asterisks a second time, so the conversion is gated
 * on the row's own `body_format`: a row is converted when it says BBCode, and
 * the same statement that writes the converted source stamps it Markdown. Two
 * concurrent runs can both convert the same row and write the same bytes; a run
 * that dies between the read and the write leaves the row exactly as it found
 * it. There is no window in which a row is half-converted, because the source
 * and the stamp move together or not at all.
 */
import { sql } from 'drizzle-orm'

import {
  BodyFormat,
  RENDER_VERSION,
  renderMarkdown,
  sourceAsMarkdown,
  vocabularyOptions,
} from '@meith/markdown'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { readBoardVocabulary } from './vocabulary-repo'

export interface RenderBackfillRun {
  /** Posts rewritten in this run. Fewer than the batch means caught up. */
  readonly rendered: number
  /** How many of those were BBCode until this run touched them. */
  readonly converted: number
}

export class PostgresRenderBackfill {
  constructor(private readonly db: Database) {}

  /** How many posts are still on an older renderer. For System Health (F70). */
  async pending(): Promise<number> {
    const vocabulary = await readBoardVocabulary(this.db)
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as pending
          from posts
         where render_version <> ${RENDER_VERSION}
            or vocab_version <> ${vocabulary.revision}
            or body_format <> ${BodyFormat.Markdown}
      `),
    ) as Array<{ pending: number }>
    return Number(rows[0]?.pending ?? 0)
  }

  async run(batchSize: number): Promise<RenderBackfillRun> {
    if (batchSize <= 0) return { rendered: 0, converted: 0 }

    /*
     * F71. "Stale" is now two questions — the renderer's code and the board's
     * vocabulary — because both decide what `message_html` contains. Read once
     * per run rather than per row: the whole point of a batch is that it renders
     * many posts with one compiled vocabulary.
     */
    const vocabulary = await readBoardVocabulary(this.db)

    const stale = resultRows(
      await this.db.execute(sql`
        select id, message, body_format
          from posts
         where render_version <> ${RENDER_VERSION}
            or vocab_version <> ${vocabulary.revision}
            or body_format <> ${BodyFormat.Markdown}
         order by id
         limit ${batchSize}
      `),
    ) as Array<{ id: number; message: string; body_format: number }>

    if (stale.length === 0) return { rendered: 0, converted: 0 }

    const rendered = stale.map((row) => {
      const format = Number(row.body_format)
      /*
       * The source is rewritten only when it changes language. A row already
       * on Markdown keeps the exact bytes its author typed — this sweep runs
       * over every post on the board on every renderer change, and one that
       * rewrote `message` each time would be an edit history nobody made.
       */
      const message = sourceAsMarkdown(row.message, format)
      return {
        id: Number(row.id),
        message,
        html: renderMarkdown(message, vocabularyOptions(vocabulary)).html,
        converted: format !== BodyFormat.Markdown,
      }
    })

    /*
     * One statement for the batch. The alternative — an update per post — is
     * the same work spread over `batchSize` round trips, which on a pooled
     * serverless connection is what turns a 200-post batch into a run that
     * spends its budget on latency.
     */
    const values = sql.join(
      rendered.map((row) => sql`(${row.id}::int, ${row.message}::text, ${row.html}::text)`),
      sql`, `,
    )
    await this.db.execute(sql`
      update posts as p
         set message = v.message,
             message_html = v.html,
             render_version = ${RENDER_VERSION},
             vocab_version = ${vocabulary.revision},
             body_format = ${BodyFormat.Markdown}
        from (values ${values}) as v(id, message, html)
       where p.id = v.id
    `)

    return {
      rendered: rendered.length,
      converted: rendered.filter((row) => row.converted).length,
    }
  }
}
