import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { assertSafePrefix, MysqlMybbSource } from './mysql-source'

interface Recorded {
  readonly sql: string
  readonly values: readonly unknown[]
}

function fakeConnection(pages: readonly (readonly unknown[])[]) {
  const log: Recorded[] = []
  let call = 0

  const connection = {
    query: async (sql: string, values: readonly unknown[]) => {
      log.push({ sql, values })
      return [pages[call++] ?? [], null] as [unknown, unknown]
    },
    end: async () => {},
  }

  return { connection, log }
}

function sourceOver(pages: readonly (readonly unknown[])[], prefix = 'mybb_') {
  const { connection, log } = fakeConnection(pages)
  const Ctor = MysqlMybbSource as unknown as new (c: unknown, p: string) => MysqlMybbSource
  return { source: new Ctor(connection, prefix), log }
}

describe('the statements it issues', () => {
  it('only ever selects', async () => {
    const { source, log } = sourceOver([[], [], [], []])

    await source.users(0, 10)
    await source.forums(0, 10)
    await source.threads(0, 10)
    await source.posts(0, 10)

    expect(log).toHaveLength(4)
    for (const { sql } of log) {
      expect(sql.trimStart().toLowerCase().startsWith('select')).toBe(true)
      expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|truncate|replace)\b/i)
    }
  })

  it.each([
    ['users', 'uid'],
    ['forums', 'fid'],
    ['threads', 'tid'],
    ['posts', 'pid'],
  ] as const)('pages %s by keyset on %s', async (method, key) => {
    const { source, log } = sourceOver([[]])
    await source[method](41, 500)

    const { sql, values } = log[0]!
    expect(sql).toContain(`where ${key} > ?`)
    expect(sql).toContain(`order by ${key} asc`)
    expect(sql).toContain('limit ?')
    expect(sql).not.toMatch(/\boffset\b/i)
    expect(values).toEqual([41, 500])
  })

  it('reads each table under the configured prefix', async () => {
    const { source, log } = sourceOver([[], [], [], []], 'forum2011_')

    await source.users(0, 1)
    await source.forums(0, 1)
    await source.threads(0, 1)
    await source.posts(0, 1)

    expect(log.map((entry) => entry.sql)).toEqual([
      expect.stringContaining('`forum2011_users`'),
      expect.stringContaining('`forum2011_forums`'),
      expect.stringContaining('`forum2011_threads`'),
      expect.stringContaining('`forum2011_posts`'),
    ])
  })

  it('binds the cursor and the limit rather than interpolating them', async () => {
    const { source, log } = sourceOver([[]])
    await source.posts(999, 250)

    expect(log[0]!.sql).not.toContain('999')
    expect(log[0]!.sql).not.toContain('250')
    expect(log[0]!.values).toEqual([999, 250])
  })
})

describe('the cursor', () => {
  const post = (pid: number) => ({ pid, tid: 1, fid: 1, uid: 1 })

  it('returns the last id of a full page', async () => {
    const { source } = sourceOver([[post(7), post(8), post(9)]])
    expect(await source.posts(0, 3)).toMatchObject({ nextCursor: 9 })
  })

  it('stops on a short page', async () => {
    const { source } = sourceOver([[post(7), post(8)]])
    expect(await source.posts(0, 3)).toMatchObject({ nextCursor: null })
  })

  it('stops on an empty page', async () => {
    const { source } = sourceOver([[]])
    expect(await source.posts(0, 3)).toEqual({ rows: [], nextCursor: null })
  })
})

describe('the table prefix', () => {
  it.each([
    ['mybb_', 'the default'],
    ['', 'no prefix at all is legal'],
    ['forum2011_', 'digits and underscores'],
  ])('accepts %s — %s', (prefix) => {
    expect(() => assertSafePrefix(prefix)).not.toThrow()
  })

  it.each([
    ['mybb`_', 'a backtick would close the quoted identifier'],
    ['mybb_; drop table users; --', 'statement injection'],
    ['mybb users', 'a space'],
    ['mybb-users', 'a hyphen'],
    ['mybb_"', 'a double quote'],
    ["mybb_'", 'a single quote'],
    ['a'.repeat(33), 'longer than any real prefix'],
  ])('refuses %s — %s', (prefix) => {
    expect(() => assertSafePrefix(prefix)).toThrow(/Unsafe MyBB table prefix/)
  })

  it('refuses at connect time, before a connection is opened', async () => {
    await expect(
      MysqlMybbSource.connect({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'mybb',
        tablePrefix: 'evil`',
      }),
    ).rejects.toThrow(/Unsafe MyBB table prefix/)
  })
})

describe('loading the driver', () => {
  it('reaches mysql2 only through a dynamic import', async () => {
    const source = await readFile(new URL('./mysql-source.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/await import\('mysql2\/promise'\)/)
    expect(source).not.toMatch(/^import .*'mysql2/m)
    expect(source).not.toMatch(/^import .*'mysql2\/promise'/m)
  })

  it('does not import mysql2 types either', async () => {
    const source = await readFile(new URL('./mysql-source.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/import type .*'mysql2/)
  })
})
