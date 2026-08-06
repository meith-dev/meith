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

  it('keeps a row whose state is not what a fresh install has', async () => {
    await repo.setEnabled('midnight', false, 'Midnight')
    await repo.save({
      key: 'midnight',
      title: 'Midnight',
      tokenOverrides: { light: { primary: '#123456' }, dark: {} },
      customCss: '.x{}',
    })

    await repo.reset('midnight')

    const record = await repo.read('midnight')
    expect(record?.enabled).toBe(false)
    expect(record?.tokenOverrides).toEqual({})
    expect(record?.customCss).toBeNull()
  })
})

describe('enablement', () => {
  it('creates a row for a theme that is turned off, because off is a decision', async () => {
    await repo.setEnabled('midnight', false, 'Midnight')

    expect((await repo.read('midnight'))?.enabled).toBe(false)
  })

  it('reads an absent row as enabled', async () => {
    expect(await repo.read('midnight')).toBeNull()
    expect((await repo.list()).some((row) => row.key === 'midnight')).toBe(false)
  })

  it('leaves the enabled state alone when the colours are saved', async () => {
    await repo.setEnabled('midnight', false, 'Midnight')
    await repo.save({
      key: 'midnight',
      title: 'Midnight',
      tokenOverrides: { light: { primary: '#123456' }, dark: {} },
      customCss: null,
    })

    expect((await repo.read('midnight'))?.enabled).toBe(false)
  })

  it('refuses a blank key', async () => {
    await expect(repo.setEnabled('  ', false, 'x')).rejects.toThrow(/No such theme/)
    await expect(repo.setDefault('  ', 'x')).rejects.toThrow(/No such theme/)
  })
})

describe('the default theme', () => {
  it('moves, leaving exactly one', async () => {
    await repo.setDefault('default', 'Default')
    await repo.setDefault('midnight', 'Midnight')

    const rows = await repo.list()
    expect(rows.filter((row) => row.isDefault).map((row) => row.key)).toEqual(['midnight'])
  })

  it('enables the theme it makes default', async () => {
    await repo.setEnabled('midnight', false, 'Midnight')
    await repo.setDefault('midnight', 'Midnight')

    expect((await repo.read('midnight'))?.enabled).toBe(true)
  })
})

describe('export and import', () => {
  it('round-trips exactly', async () => {
    const tokenOverrides = { primary: '#123456', radius: '0.5rem' }
    const customCss = '.forum-row { font-weight: 600; }'
    await repo.save({ key: 'default', title: 'Default', tokenOverrides, customCss })

    const exported = await repo.exportTheme('default')
    const parsed = parseThemeExport(JSON.stringify(exported))

    await repo.reset('default')
    await repo.save({
      key: 'default',
      title: 'Default',
      tokenOverrides: parsed.tokenOverrides,
      customCss: parsed.customCss,
    })

    expect(await repo.exportTheme('default')).toEqual(exported)
  })

  it('exports an empty document for a theme with no overrides', async () => {
    expect(await repo.exportTheme('default')).toEqual({
      version: 2,
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
    expect(() =>
      parseThemeExport(JSON.stringify({ version: 3, tokenOverrides: {}, customCss: null })),
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
    const parsed = parseThemeExport(
      JSON.stringify({ version: 1, key: 'somebody-elses', tokenOverrides: { primary: '#fff' }, customCss: null }),
    )
    expect(parsed.tokenOverrides).toEqual({ primary: '#fff' })
  })

  it('reads a missing customCss as null rather than undefined', () => {
    expect(parseThemeExport(JSON.stringify({ version: 1, tokenOverrides: {} })).customCss)
      .toBeNull()
  })

  it('reads both document versions', () => {
    expect(
      parseThemeExport(JSON.stringify({ version: 1, tokenOverrides: { primary: '#fff' } }))
        .tokenOverrides,
    ).toEqual({ primary: '#fff' })

    expect(
      parseThemeExport(
        JSON.stringify({ version: 2, tokenOverrides: { light: { primary: '#fff' }, dark: {} } }),
      ).tokenOverrides,
    ).toEqual({ light: { primary: '#fff' }, dark: {} })
  })
})
