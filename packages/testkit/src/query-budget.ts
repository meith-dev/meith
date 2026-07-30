/**
 * Query-budget assertions (F11).
 *
 * The Definition of Done requires one on every list page, because an N+1 does
 * not fail a test — it passes, slowly, and only on an empty board. The board
 * index needs a last-post user and a subforum list per row; fetched naively
 * that is fifty queries on a fifty-forum board and one query in every test
 * fixture that has three forums in it.
 *
 * So the assertion is written against the *seeded* dataset, and it asserts a
 * ceiling rather than an exact count: a refactor that legitimately splits one
 * query into two should be a decision, not a test failure, but a refactor that
 * turns one into fifty must fail loudly.
 */
/*
 * Deep import, not the package barrel: `pglite.fixture` pulls in PGlite, and
 * exporting it from `@forum/db`'s index would drag a WASM Postgres into every
 * production bundle that imports the database package.
 */
import type { TestDb } from '@forum/db/pglite.fixture'

export interface QueryBudgetResult<T> {
  readonly value: T
  readonly count: number
  readonly statements: readonly string[]
}

/** Run `body`, reporting how many statements reached the database. */
export async function measureQueries<T>(
  harness: TestDb,
  body: () => Promise<T>,
): Promise<QueryBudgetResult<T>> {
  harness.queries.reset()
  const value = await body()
  return {
    value,
    count: harness.queries.count,
    statements: harness.queries.statements,
  }
}

/**
 * Assert `body` costs no more than `max` statements.
 *
 * The failure message lists the SQL, grouped and counted. An N+1 is instantly
 * recognisable that way — the same statement forty times — whereas a bare
 * "expected 41 to be <= 3" tells you that you have a problem but not where.
 */
export async function expectQueryBudget<T>(
  harness: TestDb,
  max: number,
  body: () => Promise<T>,
): Promise<T> {
  const { value, count, statements } = await measureQueries(harness, body)

  if (count > max) {
    throw new Error(
      [
        `Query budget exceeded: ${count} statements, budget ${max}.`,
        '',
        ...summarise(statements),
        '',
        'A statement repeated many times is an N+1: fetch the set in one query',
        'and join in memory, rather than once per row.',
      ].join('\n'),
    )
  }

  return value
}

/** Collapse identical statements into `N× <sql>`, most frequent first. */
function summarise(statements: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const statement of statements) {
    const key = statement.replace(/\s+/g, ' ').trim()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sql, n]) => `  ${String(n).padStart(3)}×  ${elide(sql)}`)
}

/**
 * Shorten a statement from the middle, not the end.
 *
 * Drizzle selects every column explicitly, so the table name lands *after* a
 * column list that can run to hundreds of characters. Truncating the tail hides
 * exactly the word that identifies the query — the first version of this did,
 * and reported forty repetitions of an indistinguishable `select "id", "key",
 * "title", …`.
 */
function elide(sql: string, head = 90, tail = 70): string {
  if (sql.length <= head + tail + 5) return sql
  return `${sql.slice(0, head)} … ${sql.slice(-tail)}`
}
