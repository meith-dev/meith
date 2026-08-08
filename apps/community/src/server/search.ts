import 'server-only'

/**
 * F72 at the app layer.
 *
 * One job, and it is the one the whole feature's safety rests on: **turn an
 * Actor into a `SearchScope` before any query runs.**
 *
 * The scope is built from `Authorizer.forumIdsWhere(actor, 'thread.view')` —
 * F47's answer to "which forums may this actor see" — rather than from
 * anything the request supplied. That is what stops a search from being a way
 * around forum permissions, and it is why the provider takes a scope as a
 * required argument instead of an optional filter: there is no call shape that
 * accidentally searches everything.
 */
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

/**
 * What this actor may search.
 *
 * `thread.view` rather than `post.view`: search returns posts, but a member who
 * cannot open the thread must not be told what is in it — and F47 resolves the
 * forum-level answer once rather than per hit.
 *
 * The content scope is the only place this file interprets a permission rather
 * than delegating one. It reads two flags off the resolved actor and draws no
 * conclusion from a group id, which is what R4 asks.
 */
export async function searchScopeFor(actor: Actor): Promise<SearchScope> {
  const { authorizer } = getContainer()
  const forumIds = await authorizer.forumIdsWhere(actor, 'thread.view')

  /*
   * The content scope is built here rather than decided in the provider,
   * because naming a visibility state is something one module is allowed to do
   * and a search index is not it (F47). Staff see held and removed content;
   * everybody else sees what is visible.
   */
  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    forumIds,
    viewerUserId: actor.userId,
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}
