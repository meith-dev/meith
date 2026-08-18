import { msg } from '@meith/i18n'
import 'server-only'

import type { Actor } from '@meith/authorization'
import { contentScopeFrom, ForbiddenError } from '@meith/core'
import { getDb, PostgresSearchRepository } from '@meith/db'
import type { SearchScope } from '@meith/search'

import { getContainer } from './container'
import { getSettings } from './settings'

export async function searchEnabled(): Promise<boolean> {
  return (await getSettings()).get('search.enabled') === true
}

export async function requireSearchEnabled(): Promise<void> {
  if (!(await searchEnabled())) throw new ForbiddenError(msg('board.search.disabled'))
}

export async function searchMinWordLength(): Promise<number> {
  return (await getSettings()).get('search.min_word_length')
}

export function searchProvider(): PostgresSearchRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresSearchRepository(getDb()) : null
}

export function requireSearch(): PostgresSearchRepository {
  const provider = searchProvider()
  if (provider === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-11'))
  }
  return provider
}

export async function searchScopeFor(actor: Actor): Promise<SearchScope> {
  const { authorizer } = getContainer()

  const staff = actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    ...(await authorizer.threadAudience(actor)),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}
