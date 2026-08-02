/**
 * F68's writer, against real Postgres.
 *
 * `themes` has been read on every page render since F26 and had no writer at
 * all — the fifth reader-with-no-writer this project has found. What is proven
 * here is the two decisions that are not CRUD:
 *
 *  - **a reset deletes the row**, because "no overrides" and "no row" are
 *    indistinguishable to every reader and only one of them leaves the board in
 *    the state a fresh install is in;
 *  - **an export round-trips exactly.** The roadmap's word is "exact", and the
 *    thing that makes an export worth having is that importing it produces the
 *    board it was taken from.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresThemeAdminRepository, parseThemeExport } from './theme-admin-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresThemeAdminRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresThemeAdminRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from themes`)
})

async function rowCount(): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select count(*)::int as n from themes`),
  ) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

describe('save', () => {
  it('creates the row on the first save rather than expecting a seeded one', async () => {
    /*
     * An absent row means "no overrides", which is exactly what a freshly
     * installed theme has — and `findRuntimeByKey` already returns null for it.
     * Seeding an empty row on install would make "has this board been
     * customised?" unanswerable.
     */
    expect(await rowCount()).toBe(0)

    await repo.save({
      key: 'default',
      title: 'Default',
      tokenOverrides: { primary: '#123456' },
      customCss: null,
    })

    expect((await repo.read('default'))?.tokenOverrides).toEqual({ primary: '#123456' })
  })

  it('replaces the whole set, so a cleared token is cleared', async () => {
    /*
     * The editor shows every token the theme declares, so what it submits *is*
     * the intended set. Kills the mutant that merges into what was there —
     * under which clearing a token would silently keep the old value.
     */
    await repo.save({
      key: 'default',
      title: 'Default',
      tokenOverrides: { primary: '#123456', accent: '#abcdef' },
      customCss: null,
    })
    await repo.save({
      key: 'default',
      title: 'Default',
      tokenOverrides: { primary: '#123456' },
      customCss: null,
    })

    expect((await repo.read('default'))?.tokenOverrides).toEqual({ primary: '#123456' })
  })

  it('stores custom CSS and reads it back unchanged', async () => {
    const css = '.forum-row { font-weight: 600; }'
    await repo.save({ key: 'default', title: 'Default', tokenOverrides: {}, customCss: css })

    expect((await repo.read('default'))?.customCss).toBe(css)
  })

  it('keeps one row per theme however often it is saved', async () => {
    for (let i = 0; i < 3; i += 1) {
      await repo.save({
        key: 'default',
        title: 'Default',
        tokenOverrides: { primary: `#00000${i}` },
        customCss: null,
      })
    }

    expect(await rowCount()).toBe(1)
  })

  it('refuses a blank key', async () => {
    await expect(
      repo.save({ key: '  ', title: 'x', tokenOverrides: {}, customCss: null }),
    ).rejects.toThrow(/No such theme/)
  })
})

describe('reset', () => {
  it('deletes the row rather than writing empty values', async () => {
    /*
     * Kills the mutant that writes `{}`. Both look identical to every reader,
     * but only the delete puts the board back in the state a fresh install is
     * in — which is what "reset" means and what keeps "has this board been
     * customised?" answerable.
     */
    await repo.save({
      key: 'default',
      title: 'Default',
      tokenOverrides: { primary: '#123456' },
      customCss: '.x{}',
    })

    await repo.reset('default')

    expect(await rowCount()).toBe(0)
    expect(await repo.read('default')).toBeNull()
  })

  it('is harmless on a theme that was never customised', async () => {
    await repo.reset('default')
    expect(await rowCount()).toBe(0)
  })
})

describe('export and import', () => {
  it('round-trips exactly', async () => {
    /*
     * The roadmap's word is "exact". What makes an export worth having is that
     * importing it produces the board it was taken from — so this asserts the
     * whole document survives the trip, not that a couple of fields do.
     */
    const tokenOverrides = { primary: '#123456', radius: '0.5rem' }
    const customCss = '.forum-row { font-weight: 600; }'
    await repo.save({ key: 'default', title: 'Default', tokenOverrides, customCss })

    const exported = await repo.exportTheme('default')
    const parsed = parseThemeExport(JSON.stringify(exported))

    await repo.reset('default')
    await repo.save({
      key: 'default',
      title: 'Default',
      tokenOverrides: parsed.tokenOverrides as Record<string, string>,
      customCss: parsed.customCss,
    })

    expect(await repo.exportTheme('default')).toEqual(exported)
  })

  it('exports an empty document for a theme with no overrides', async () => {
    /*
     * Rather than failing. An untouched theme is a legitimate thing to export —
     * it is how somebody takes a blank starting point to another board.
     */
    expect(await repo.exportTheme('default')).toEqual({
      version: 1,
      key: 'default',
      tokenOverrides: {},
      customCss: null,
    })
  })

  it('carries no timestamp, so an import claims no history', async () => {
    await repo.save({ key: 'default', title: 'Default', tokenOverrides: {}, customCss: null })
    expect(Object.keys(await repo.exportTheme('default')).sort()).toEqual([
      'customCss',
      'key',
      'tokenOverrides',
      'version',
    ])
  })
})

describe('parseThemeExport', () => {
  it('refuses text that is not JSON', () => {
    expect(() => parseThemeExport('not json')).toThrow(/valid JSON/)
  })

  it('refuses a JSON array or a bare value', () => {
    expect(() => parseThemeExport('[]')).toThrow(/JSON object/)
    expect(() => parseThemeExport('"hello"')).toThrow(/JSON object/)
  })

  it('refuses a version it does not know', () => {
    /*
     * An import is a file somebody has been emailed. The failure worth catching
     * is a document from a later shape being applied as if it were this one —
     * which would silently drop whatever that version added. Kills the mutant
     * that ignores the envelope.
     */
    expect(() =>
      parseThemeExport(JSON.stringify({ version: 2, tokenOverrides: {}, customCss: null })),
    ).toThrow(/different version/)
    expect(() => parseThemeExport(JSON.stringify({ tokenOverrides: {} }))).toThrow(
      /different version/,
    )
  })

  it('refuses a document with no token object', () => {
    expect(() => parseThemeExport(JSON.stringify({ version: 1 }))).toThrow(/tokenOverrides/)
    expect(() =>
      parseThemeExport(JSON.stringify({ version: 1, tokenOverrides: 'red' })),
    ).toThrow(/tokenOverrides/)
  })

  it('refuses custom CSS that is not text', () => {
    expect(() =>
      parseThemeExport(JSON.stringify({ version: 1, tokenOverrides: {}, customCss: 12 })),
    ).toThrow(/must be text/)
  })

  it('ignores the key in the file, so a look can be copied between themes', () => {
    /*
     * Copying a look from one board to another is the case this feature exists
     * for, and refusing a document whose key differs would make it useless for
     * exactly that. The key being edited wins.
     */
    const parsed = parseThemeExport(
      JSON.stringify({ version: 1, key: 'somebody-elses', tokenOverrides: { primary: '#fff' }, customCss: null }),
    )
    expect(parsed.tokenOverrides).toEqual({ primary: '#fff' })
  })

  it('reads a missing customCss as null rather than undefined', () => {
    expect(parseThemeExport(JSON.stringify({ version: 1, tokenOverrides: {} })).customCss)
      .toBeNull()
  })
})
