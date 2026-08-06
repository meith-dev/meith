import { sql } from 'drizzle-orm'

import { EMPTY_VOCABULARY, compileVocabulary, type BoardVocabulary } from '@meith/markdown'

import type { Database } from './client'
import { resultRows } from './result-rows'

export async function readBoardVocabulary(db: Database): Promise<BoardVocabulary> {
  const source = await db.transaction(async (tx) => {
    const revision = resultRows(
      await tx.execute(sql`select version from cache_versions where key = 'markdown_vocabulary'`),
    ) as Array<{ version: number }>

    if (Number(revision[0]?.version ?? 0) === 0) return null

    const smilies = resultRows(
      await tx.execute(sql`select code, src, alt from smilies where enabled = true order by id`),
    ) as Array<Record<string, unknown>>

    const directives = resultRows(
      await tx.execute(sql`select name, block from custom_directives where enabled = true order by name`),
    ) as Array<Record<string, unknown>>

    return {
      revision: Number(revision[0]?.version ?? 0),
      smilies: smilies.map((row) => ({
        code: String(row.code),
        src: String(row.src),
        ...(row.alt === null ? {} : { alt: String(row.alt) }),
      })),
      directives: directives.map((row) => ({
        name: String(row.name),
        block: row.block === true,
      })),
    }
  })

  return source === null ? EMPTY_VOCABULARY : compileVocabulary(source)
}
