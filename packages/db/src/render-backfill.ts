import { sql } from 'drizzle-orm'

import {
  authorRef,
  BodyFormat,
  CORE_RENDERING,
  type MarkdownPipeline,
  RENDER_VERSION,
  renderThrough,
  sourceAsMarkdown,
  vocabularyOptions,
} from '@meith/markdown'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { readBoardVocabulary } from './vocabulary-repo'

export interface RenderBackfillRun {
  readonly rendered: number
  readonly converted: number
}

export class PostgresRenderBackfill {
  constructor(
    private readonly db: Database,
    private readonly rendering: MarkdownPipeline = CORE_RENDERING,
  ) {}

  async pending(): Promise<number> {
    const vocabulary = await readBoardVocabulary(this.db, this.rendering)
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

    const vocabulary = await readBoardVocabulary(this.db, this.rendering)

    const stale = resultRows(
      await this.db.execute(sql`
        select id, message, body_format, author_user_id
          from posts
         where render_version <> ${RENDER_VERSION}
            or vocab_version <> ${vocabulary.revision}
            or body_format <> ${BodyFormat.Markdown}
         order by id
         limit ${batchSize}
      `),
    ) as Array<{
      id: number
      message: string
      body_format: number
      author_user_id: number | null
    }>

    if (stale.length === 0) return { rendered: 0, converted: 0 }

    const rendered = await Promise.all(
      stale.map(async (row) => {
        const format = Number(row.body_format)
        const message = sourceAsMarkdown(row.message, format)
        const body = await renderThrough(
          this.rendering,
          message,
          {
            source: 'post',
            viewer: authorRef(row.author_user_id === null ? null : Number(row.author_user_id)),
          },
          vocabularyOptions(vocabulary),
        )
        return {
          id: Number(row.id),
          message,
          html: body.html,
          converted: format !== BodyFormat.Markdown,
        }
      }),
    )

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
