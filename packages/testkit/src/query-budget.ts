import type { TestDb } from '@meith/db/pglite.fixture'

export interface QueryBudgetResult<T> {
  readonly value: T
  readonly count: number
  readonly statements: readonly string[]
}

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

function elide(sql: string, head = 90, tail = 70): string {
  if (sql.length <= head + tail + 5) return sql
  return `${sql.slice(0, head)} … ${sql.slice(-tail)}`
}
