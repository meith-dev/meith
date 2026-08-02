/**
 * F71's content vocabularies, against real Postgres.
 *
 * The claim worth the file: **`activeWordFilters` drops disabled rows itself**.
 * The alternative is every render site remembering to check `enabled`, and a
 * filter an operator switched off that still applies on one page is worse than
 * having no switch at all.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresContentAdminRepository } from './content-admin-repo'

let harness: TestDb
let db: Database
let repo: PostgresContentAdminRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresContentAdminRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from word_filters`)
  await db.execute(sql`delete from thread_prefixes`)
})

describe('word filters', () => {
  it('round-trips a filter', async () => {
    const id = await repo.createWordFilter({
      pattern: 'badword',
      replacement: '***',
      wholeWord: true,
    })

    const filters = await repo.listWordFilters()
    expect(filters).toEqual([
      { id, pattern: 'badword', replacement: '***', wholeWord: true, enabled: true },
    ])
  })

  it('keeps a disabled filter out of what the renderer applies', async () => {
    /*
     * The claim. Kills the mutant that returns every row and leaves `enabled`
     * to the caller — under which a filter an operator switched off keeps
     * applying wherever somebody forgot the check.
     */
    const on = await repo.createWordFilter({ pattern: 'a', replacement: 'x', wholeWord: true })
    const off = await repo.createWordFilter({ pattern: 'b', replacement: 'y', wholeWord: true })
    await repo.updateWordFilter(off, {
      pattern: 'b',
      replacement: 'y',
      wholeWord: true,
      enabled: false,
    })

    const active = await repo.activeWordFilters()
    expect(active.map((rule) => rule.pattern)).toEqual(['a'])
    expect((await repo.listWordFilters()).map((row) => row.id)).toEqual([on, off])
  })

  it('never hands the renderer an empty pattern', async () => {
    /*
     * An empty pattern compiles to a matcher that hits at every position, which
     * would insert the replacement between every character of every post. The
     * create path refuses one; this is the second line of defence for a row
     * that arrived any other way.
     */
    await db.execute(sql`insert into word_filters (pattern, replacement) values ('', 'X')`)
    expect(await repo.activeWordFilters()).toEqual([])
  })

  it('refuses a blank pattern on create and on update', async () => {
    await expect(
      repo.createWordFilter({ pattern: '   ', replacement: 'x', wholeWord: true }),
    ).rejects.toThrow(/something to match/)

    const id = await repo.createWordFilter({ pattern: 'a', replacement: 'x', wholeWord: true })
    await expect(
      repo.updateWordFilter(id, { pattern: '', replacement: 'x', wholeWord: true, enabled: true }),
    ).rejects.toThrow(/something to match/)
  })

  it('keeps a replacement that is only spaces', async () => {
    /*
     * Blanking a word with a space is a legitimate thing to want, and trimming
     * the replacement would silently turn it into deletion.
     */
    const id = await repo.createWordFilter({ pattern: 'a', replacement: ' ', wholeWord: true })
    expect((await repo.listWordFilters()).find((row) => row.id === id)?.replacement).toBe(' ')
  })

  it('refuses to update a filter that does not exist', async () => {
    await expect(
      repo.updateWordFilter(9_999, {
        pattern: 'a',
        replacement: 'x',
        wholeWord: true,
        enabled: true,
      }),
    ).rejects.toThrow(/No such filter/)
  })

  it('deletes a filter outright, which is safe because filtering is at render', async () => {
    const id = await repo.createWordFilter({ pattern: 'a', replacement: 'x', wholeWord: true })
    await repo.deleteWordFilter(id)

    expect(await repo.listWordFilters()).toEqual([])
  })
})

describe('thread prefixes', () => {
  it('round-trips a prefix and orders by display order', async () => {
    /*
     * `thread_prefixes` has been read by the composer since F33 and had no
     * writer — it could only be populated with SQL.
     */
    /*
     * Three rows, inserted so that neither id order matches display order —
     * with two, the creation order happens to sort the same way both ways and
     * the assertion proves nothing about the ORDER BY.
     */
    await repo.createPrefix({
      label: 'Last',
      token: 'thread-pinned',
      displayOrder: 30,
      forumPathPrefix: null,
    })
    await repo.createPrefix({
      label: 'Ask',
      token: null,
      displayOrder: 10,
      forumPathPrefix: '1.2',
    })
    await repo.createPrefix({
      label: 'Middle',
      token: null,
      displayOrder: 20,
      forumPathPrefix: null,
    })

    const prefixes = await repo.listPrefixes()
    expect(prefixes.map((row) => row.label)).toEqual(['Ask', 'Middle', 'Last'])
    expect(prefixes[0]).toMatchObject({ forumPathPrefix: '1.2', token: null })
  })

  it('refuses a blank label', async () => {
    await expect(
      repo.createPrefix({ label: '  ', token: null, displayOrder: 0, forumPathPrefix: null }),
    ).rejects.toThrow(/needs a label/)
  })

  it('deleting one leaves the threads that used it, minus the prefix', async () => {
    /*
     * `threads.prefix_id` is nullable with `on delete set null`. Refusing to
     * delete a prefix in use would make a mistyped one permanent; deleting the
     * threads would be absurd.
     */
    await db.execute(sql`
      insert into forums (id, type, title, slug, path)
      values (1, 'forum', 'General', 'general', '1')
      on conflict (id) do nothing
    `)
    const prefixId = await repo.createPrefix({
      label: 'Ask',
      token: null,
      displayOrder: 0,
      forumPathPrefix: null,
    })
    await db.execute(sql`
      insert into threads (id, forum_id, author_username, title, slug, prefix_id)
      values (900, 1, 'ann', 'T', 't-900', ${prefixId})
    `)

    await repo.deletePrefix(prefixId)

    const rows = (await db.execute(
      sql`select prefix_id from threads where id = 900`,
    )) as unknown as { rows?: Array<{ prefix_id: number | null }> }
    const list = Array.isArray(rows) ? rows : (rows.rows ?? [])
    expect(list[0]?.prefix_id ?? null).toBeNull()

    await db.execute(sql`delete from threads where id = 900`)
  })
})
