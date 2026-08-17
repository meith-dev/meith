import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

  it('survives the round trip a cache puts it through', async () => {
    await configure()

    const source = await readVocabularySource(db)
    const cached = JSON.parse(JSON.stringify(source)) as NonNullable<typeof source>
    const vocabulary = compileVocabulary(cached)

    expect(vocabulary.directives.inline.has('spoiler')).toBe(true)
    expect(vocabulary.rejected).toEqual([])

    const rendered = renderMarkdown('Ends :spoiler[badly].', {
      directives: vocabulary.directives,
      ...(vocabulary.smilies === undefined ? {} : { smilies: vocabulary.smilies }),
    })
    expect(rendered.html).toContain('md-directive-spoiler')

    expect(
      renderMarkdown('Ends :nosuch[badly].', { directives: vocabulary.directives }).html,
    ).toContain(':nosuch[badly]')
  })
})
