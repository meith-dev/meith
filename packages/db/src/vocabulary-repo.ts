/**
 * F71 — reading the board's markup vocabulary, for the paths that must render
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

import {
  EMPTY_VOCABULARY,
  compileVocabulary,
  type BoardVocabulary,
  type VocabularySource,
} from '@meith/markdown'

import type { Database } from './client'
import { resultRows } from './result-rows'

/**
 * The rows, uncompiled — and the only shape that may cross a cache.
 *
 * Read inside one transaction so the two halves agree. Read separately, an
 * operator's edit landing between them would stamp the *new* revision onto HTML
 * rendered from the *old* list — a stored render that is wrong and that the
 * backfill will never revisit, because its stamp claims it is current. Every
 * other failure in this feature is transient; that one would be permanent.
 *
 * `BoardVocabulary` holds the parser's two directive **`Set`s**, and a `Set`
 * does not survive `JSON.stringify`: it comes back as `{}`. Next's
 * `unstable_cache` serialises, so a board that had ever configured a smiley or a
 * directive served a vocabulary whose registry had no `has` method, and the
 * first post containing `:name[…]` or a `:::name` fence took the *thread page*
 * down with `context.directives.has is not a function` — a 500 any member could
 * cause by typing four characters, on a board where nobody had defined that
 * name.
 *
 * So the cache holds this — numbers, strings and arrays — and compiling happens
 * on the other side of it. That is what `activeWordFilter` already does with its
 * rules, and this is the same arrangement rather than a new idea.
 *
 * `null` means "nothing configured", the overwhelmingly common case, answered
 * without touching either table.
 */
export async function readVocabularySource(
  db: Database,
): Promise<VocabularySource | null> {
  return db.transaction(async (tx) => {
    const revision = resultRows(
      await tx.execute(sql`select version from cache_versions where key = 'markdown_vocabulary'`),
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
}

/**
 * The compiled vocabulary, for a caller with no cache between it and the rows.
 *
 * The write path is that caller: it reads inside its own transaction and hands
 * the result straight to the renderer. A caller that *does* cache must cache
 * `readVocabularySource` and compile afterwards — see that function.
 */
export async function readBoardVocabulary(db: Database): Promise<BoardVocabulary> {
  const source = await readVocabularySource(db)
  return source === null ? EMPTY_VOCABULARY : compileVocabulary(source)
}
