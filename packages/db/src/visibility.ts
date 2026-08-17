import { type SQL, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { ContentScope } from '@meith/core'

export function visibleIn(column: PgColumn | SQL, scope: ContentScope): SQL {
  const first = scope.states[0]
  if (scope.states.length === 1) return sql`${column} = ${first}`
  return sql`${column} in (${sql.join(
    scope.states.map((state) => sql`${state}`),
    sql`, `,
  )})`
}

export const PENDING_APPROVAL = 'unapproved' as const

export const VISIBLE = 'visible' as const
