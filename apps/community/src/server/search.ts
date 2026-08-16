import 'server-only'

import type { Actor } from '@meith/authorization'
import { ForbiddenError, contentScopeFrom } from '@meith/core'
import type { SearchScope } from '@meith/search'
import { PostgresSearchRepository, getDb } from '@meith/db'

import { getContainer } from './container'
import { getSettings } from './settings'

export const SEARCH_OFF_MESSAGE =
  'Search is switched off on this board. Browse the forums instead, or ask an administrator to turn it back on.'

export async function searchEnabled(): Promise<boolean> {
  return (await getSettings()).get('search.enabled') === true
}

export async function requireSearchEnabled(): Promise<void> {
  if (!(await searchEnabled())) throw new ForbiddenError(SEARCH_OFF_MESSAGE)
}

export async function searchMinWordLength(): Promise<number> {
  return (await getSettings()).get('search.min_word_length')
}

export function searchProvider(): PostgresSearchRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresSearchRepository(getDb())
    : null
}

export function requireSearch(): PostgresSearchRepository {
  const provider = searchProvider()
  if (provider === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, which is not indexed for search.',
    )
  }
  return provider
}

export async function searchScopeFor(actor: Actor): Promise<SearchScope> {
  const { authorizer } = getContainer()

  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    ...(await authorizer.threadAudience(actor)),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}
