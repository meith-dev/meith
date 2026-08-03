import 'server-only'

/**
 * F71 at the app layer.
 *
 * The word filter set is read on the **render path** — every thread page runs
 * it — so it is cached against its own tag and compiled once per render rather
 * than once per post. The set is small by design; the editor says so, and the
 * cost of an operator ignoring that is a slower thread page rather than a
 * broken one.
 */
import { CacheTags, ForbiddenError } from '@forum/core'
import { compileWordFilter, type CompiledWordFilter } from '@forum/bbcode'
import { PostgresContentAdminRepository, getDb } from '@forum/db'
import { unstable_cache } from 'next/cache'

import { getContainer } from './container'

export function contentAdminRepository(): PostgresContentAdminRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresContentAdminRepository(getDb())
    : null
}

export function requireContentAdmin(): PostgresContentAdminRepository {
  const repository = contentAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its content settings cannot be edited.',
    )
  }
  return repository
}

const loadFilters = unstable_cache(
  async () => new PostgresContentAdminRepository(getDb()).activeWordFilters(),
  ['word-filters'],
  { tags: [CacheTags.wordFilters()] },
)

/**
 * The compiled filter for a render, or `undefined` when there is nothing to do.
 *
 * `undefined` rather than an empty compiled set, so the render path can skip
 * the pass entirely — on the overwhelming majority of boards there are no
 * filters at all, and they should pay nothing for the feature.
 */
export async function activeWordFilter(): Promise<CompiledWordFilter | undefined> {
  if (getContainer().dataSource !== 'postgres') return undefined

  const rules = await loadFilters()
  return rules.length === 0 ? undefined : compileWordFilter(rules)
}
