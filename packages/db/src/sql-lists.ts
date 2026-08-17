import { type SQL, sql } from 'drizzle-orm'

export function idList(ids: readonly number[]): SQL {
  if (ids.length === 0) return sql`(null)`
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`
}

export function textList(values: readonly string[]): SQL {
  if (values.length === 0) return sql`(null)`
  return sql`(${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`
}
