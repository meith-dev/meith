/**
 * F71's vocabulary read, against real Postgres — and the one property that is
 * not about SQL at all.
 *
 * ## Why a serialisation test lives here
 *
 * `readBoardVocabulary` returns a compiled `BoardVocabulary`, and compiled means
 * the parser's two directive **`Set`s**. A `Set` does not survive
 * `JSON.stringify`: it comes back as `{}`. The app caches this read through
 * Next's `unstable_cache`, which serialises — so on any board that had ever
 * saved a smiley or a directive, the cached vocabulary reached the renderer with
 * a registry that had no `has` method, and the first post containing `:name[…]`
 * or a `:::name` fence threw `context.directives.has is not a function` and took
 * the thread page down. Four characters, typed by any member, on a name nobody
 * had defined.
 *
 * The fix is `readVocabularySource`: rows only, compiled on the far side of the
 * cache. The test below is what keeps it that way — it round-trips exactly what
 * the cache would store and then renders through the result, so a future change
 * that puts a `Set` back into this shape fails here rather than on a thread page.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { compileVocabulary, renderMarkdown } from '@meith/markdown'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { readBoardVocabulary, readVocabularySource } from './vocabulary-repo'

let harness: TestDb
let db: Database

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from smilies`)
  await db.execute(sql`delete from custom_directives`)
  await db.execute(sql`delete from cache_versions where key = 'markdown_vocabulary'`)
})

/** What an operator's save leaves behind: rows, and a bumped revision. */
async function configure(): Promise<void> {
  await db.execute(sql`
    insert into cache_versions (key, version) values ('markdown_vocabulary', 3)
     on conflict (key) do update set version = 3
  `)
  await db.execute(sql`
    insert into custom_directives (name, block, enabled) values ('spoiler', false, true)
  `)
  await db.execute(sql`
    insert into smilies (code, src, alt, enabled) values (':)', '/s/smile.png', 'smile', true)
  `)
}

describe('readVocabularySource', () => {
  it('answers null for a board that has configured nothing', async () => {
    expect(await readVocabularySource(db)).toBeNull()
    expect((await readBoardVocabulary(db)).revision).toBe(0)
  })

  it('reads the rows and the revision that produced them', async () => {
    await configure()

    const source = await readVocabularySource(db)
    expect(source?.revision).toBe(3)
    expect(source?.directives).toEqual([{ name: 'spoiler', block: false }])
    expect(source?.smilies).toEqual([{ code: ':)', src: '/s/smile.png', alt: 'smile' }])
  })

  /**
   * The property the cache depends on, stated as a test.
   *
   * `JSON.parse(JSON.stringify(…))` is what `unstable_cache` does to a value on
   * its way in and out. Compiling *after* that has to produce a vocabulary the
   * parser can use — which is precisely what compiling *before* it did not.
   */
  it('survives the round trip a cache puts it through', async () => {
    await configure()

    const source = await readVocabularySource(db)
    const cached = JSON.parse(JSON.stringify(source)) as NonNullable<typeof source>
    const vocabulary = compileVocabulary(cached)

    expect(vocabulary.directives.inline.has('spoiler')).toBe(true)
    expect(vocabulary.rejected).toEqual([])

    /* And the renderer accepts it, which is the failure this test is named for. */
    const rendered = renderMarkdown('Ends :spoiler[badly].', {
      directives: vocabulary.directives,
      ...(vocabulary.smilies === undefined ? {} : { smilies: vocabulary.smilies }),
    })
    expect(rendered.html).toContain('md-directive-spoiler')

    /* An undefined name is text, not a crash — the case that took the page down. */
    expect(renderMarkdown('Ends :nosuch[badly].', { directives: vocabulary.directives }).html)
      .toContain(':nosuch[badly]')
  })
})
