/**
 * F47 — the only place a visibility column is compared in a read.
 *
 * Every viewer-facing query calls this and nothing else names a state. That is
 * what makes the model enforceable: `pnpm guards` fires on any other mention of
 * the column outside the write and counter paths, so a read path added without
 * a scope fails the build rather than shipping a leak.
 *
 * Two details are load-bearing:
 *
 *   - It is an **allowlist** (`in (…)`), never `<> 'deleted'`. A negative
 *     predicate is one new state away from letting that state through, and R3.3
 *     already reserves the right to add one.
 *   - The states come from the scope, which comes from
 *     `Authorizer.contentScope`. Nothing here decides anything; if this file
 *     ever grows an `if`, the decision has escaped the permission model.
 */
import { sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { ContentScope } from '@forum/core'

/**
 * `column in (<the states this actor may see>)`.
 *
 * The common case — a public scope — is emitted as plain equality so the R3.5
 * partial indexes (`… WHERE visibility = 'visible'`) still match. An `in` list
 * of one would be a correct query that quietly stopped using the index every
 * listing on the board depends on.
 */
export function visibleIn(column: PgColumn | SQL, scope: ContentScope): SQL {
  const first = scope.states[0]
  if (scope.states.length === 1) return sql`${column} = ${first}`
  return sql`${column} in (${sql.join(
    scope.states.map((state) => sql`${state}`),
    sql`, `,
  )})`
}

/**
 * The state held content sits in, as a *value*.
 *
 * F48's queue has to name it — "what is waiting for approval" is the queue's
 * subject, not a decision about a reader — and naming it here rather than in
 * the queue's SQL keeps the guard's rule exact: no query writes a state
 * literal, including this one. Interpolating the constant produces a bound
 * parameter, which is also the shape the rest of the write path already uses.
 */
export const PENDING_APPROVAL = 'unapproved' as const
