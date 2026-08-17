import { type SQL, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import {
  audienceForumIds,
  audienceIsEmpty,
  type ThreadAudience,
  type ThreadAuthorFilter,
} from '@meith/core'

import { idList } from './sql-lists'

export function authoredBy(column: PgColumn | SQL, filter: ThreadAuthorFilter): SQL {
  switch (filter.kind) {
    case 'all':
      return sql`true`
    case 'none':
      return sql`false`
    case 'author':
      return sql`${column} = ${filter.userId}`
  }
}

export function inAudience(
  forumColumn: PgColumn | SQL,
  authorColumn: PgColumn | SQL,
  audience: ThreadAudience,
): SQL {
  if (audienceIsEmpty(audience)) return sql`false`

  const { open, ownThreadsOnly } = audienceForumIds(audience)
  const parts: SQL[] = []

  if (open.length > 0) parts.push(sql`${forumColumn} in ${idList(open)}`)
  if (ownThreadsOnly.length > 0) {
    parts.push(
      sql`(${forumColumn} in ${idList(ownThreadsOnly)}
           and ${authorColumn} = ${audience.viewerUserId})`,
    )
  }

  return sql`(${sql.join(parts, sql` or `)})`
}

export { audienceIsEmpty }
