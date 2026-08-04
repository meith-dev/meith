/**
 * F71 — reading the board's BBCode vocabulary, for the paths that must render
 * with it.
 *
 * A free function rather than a method on `PostgresContentAdminRepository`,
 * because the callers are not administering anything: the post and thread
 * writers stamp a render with it, and F36's backfill rewrites stale ones. Making
 * them construct an *admin* repository to render a post would be the wrong
 * dependency in the wrong direction.
 *
 * ## Why the write path reads this itself
 *
 * The alternative was passing a compiled vocabulary down through
 * `NewThreadRecord`, `NewReplyRecord` and `PostEditRecord` — which live in
 * `@meith/threads` and `@meith/posts`, so the app would carry it across three
 * domain packages to reach the two statements that need it.
 *
 * One indexed read inside a write transaction is the cheaper answer in both
 * senses. A post write is already several statements, this is the smallest of
 * them, and it is on the *write* path — the one nobody is measuring in p95s.
 * What it buys is that a newly posted message is stored **already rendered with
 * the board's smilies**, so the thread page it appears on serves it from the
 * column like every other post. The version where the writer stamps the core
 * vocabulary and lets the backfill catch up would make the newest posts — the
 * ones people are actually reading — the ones that render live.
 */
import { sql } from 'drizzle-orm'

import { EMPTY_VOCABULARY, compileVocabulary, type BoardVocabulary } from '@meith/bbcode'

import type { Database } from './client'
import { resultRows } from './result-rows'

/**
 * The compiled vocabulary, and the revision that produced it.
 *
 * Read inside one transaction so the two halves agree. Read separately, an
 * operator's edit landing between them would stamp the *new* revision onto HTML
 * rendered from the *old* list — a stored render that is wrong and that the
 * backfill will never revisit, because its stamp claims it is current. Every
 * other failure in this feature is transient; that one would be permanent.
 */
export async function readBoardVocabulary(db: Database): Promise<BoardVocabulary> {
  const source = await db.transaction(async (tx) => {
    const revision = resultRows(
      await tx.execute(sql`select version from cache_versions where key = 'bbcode_vocabulary'`),
    ) as Array<{ version: number }>

    /*
     * Nothing configured is the overwhelmingly common case, and it is answered
     * without touching either table: revision 0 is what a fresh board's rows
     * are already stamped with, so there is nothing for a vocabulary to change.
     */
    if (Number(revision[0]?.version ?? 0) === 0) return null

    const smilies = resultRows(
      await tx.execute(sql`select code, src, alt from smilies where enabled = true order by id`),
    ) as Array<Record<string, unknown>>

    const customTags = resultRows(
      await tx.execute(sql`select name, block from custom_bbcode where enabled = true order by name`),
    ) as Array<Record<string, unknown>>

    return {
      revision: Number(revision[0]?.version ?? 0),
      smilies: smilies.map((row) => ({
        code: String(row.code),
        src: String(row.src),
        ...(row.alt === null ? {} : { alt: String(row.alt) }),
      })),
      customTags: customTags.map((row) => ({
        name: String(row.name),
        block: row.block === true,
      })),
    }
  })

  return source === null ? EMPTY_VOCABULARY : compileVocabulary(source)
}
