import 'server-only'

import type { Actor } from '@meith/authorization'
import { ForbiddenError, contentScopeFrom } from '@meith/core'
import type { SearchScope } from '@meith/search'
import { PostgresSearchRepository, getDb } from '@meith/db'

import { getContainer } from './container'

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
  const forumIds = await authorizer.forumIdsWhere(actor, 'thread.view')

  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    forumIds,
    viewerUserId: actor.userId,
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}
