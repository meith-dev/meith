import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { assertSafePrefix, MysqlMybbSource } from './mysql-source'

/**
 * F85 — tests for the MySQL reader.
 *
 * The reader is the one part of the importer that cannot be exercised by the
 * fixture round trip, and it is also the part with a live production database on
 * the other end. So what is tested here is not "does it read rows" — that needs
 * a MyBB server — but the three things that would be *damaging* and that a fake
 * connection can prove:
 *
 *  1. every statement is a `SELECT`, against somebody's live board;
 *  2. paging is keyset, never `OFFSET`, because the board is still being written
 *     to during a migration;
 *  3. the table prefix, the one caller-supplied value that reaches the SQL text,
 *     cannot be anything but a table-name fragment.
 */

interface Recorded {
  readonly sql: string
  readonly values: readonly unknown[]
}

/** A connection that records statements and returns whatever it is told to. */
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

/**
 * The constructor is private — deliberately, since connecting is async — so a
 * test builds one the way `connect` does. Reaching through the type is
 * confined to this helper rather than smeared across every case.
 */
function sourceOver(pages: readonly (readonly unknown[])[], prefix = 'mybb_') {
  const { connection, log } = fakeConnection(pages)
  const Ctor = MysqlMybbSource as unknown as new (c: unknown, p: string) => MysqlMybbSource
  return { source: new Ctor(connection, prefix), log }
}

describe('the statements it issues', () => {
  /*
   * The load-bearing one. This reader points at a live forum, and an importer
   * that could modify the board it reads is one nobody should run against
   * production. "We were careful" is not the guarantee; "no statement in the
   * file is anything but a select" is.
   */
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

  /*
   * Keyset, not OFFSET. The board is usually still being posted to during a
   * migration, and an OFFSET walk over a growing table skips rows — in the
   * middle, and without saying so.
   */
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

  /* Both the cursor and the limit are bound, never formatted into the text. */
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

  /*
   * Null on a *short* page, not an empty one. A full page that happens to be
   * the last still returns a cursor and costs one extra query — the alternative
   * is a source that knows its own total, which a live database being written
   * to does not. The fixture source follows exactly the same rule, which is what
   * lets both be driven by the same runner.
   */
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
  /*
   * A prefix becomes part of a table name, and a table name cannot be a bound
   * parameter — so it is the one caller-supplied value that reaches the SQL
   * text, and the only defence is refusing anything that is not a table-name
   * fragment. MyBB's own installer restricts prefixes to this shape, so nothing
   * legitimate is being turned away.
   */
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
  /*
   * `mysql2` is reached by `await import(...)` inside `connect`, never by a
   * static import. On a serverless deployment that is the difference between a
   * dependency the importer has and one every request pays for — and the app
   * *does* import this package, for F86's legacy URL table.
   *
   * This is a textual assertion on the source, which is unusual in a test file
   * and is the right shape here: the property is "no static import exists", and
   * a runtime check cannot see the absence of one. A bundler can, which is
   * exactly why it matters.
   */
  it('reaches mysql2 only through a dynamic import', async () => {
    const source = await readFile(new URL('./mysql-source.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/await import\('mysql2\/promise'\)/)
    expect(source).not.toMatch(/^import .*'mysql2/m)
    expect(source).not.toMatch(/^import .*'mysql2\/promise'/m)
  })

  /*
   * And the type side of the same rule: the file describes the slice of the
   * driver it uses rather than importing `Connection`, because a type-only
   * import is erased at runtime but still makes the package a build-time
   * requirement for anything type-checking this tree.
   */
  it('does not import mysql2 types either', async () => {
    const source = await readFile(new URL('./mysql-source.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/import type .*'mysql2/)
  })
})
