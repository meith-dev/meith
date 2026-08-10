import 'server-only'

import { randomBytes } from 'node:crypto'

import { ForbiddenError, NotFoundError } from '@meith/core'
import type { Actor } from '@meith/authorization'
import { isRunnable, parseSearchInput, type SearchQuery, type SearchResults } from '@meith/search'
import { PostgresSearchStore, getDb, ownsSearch, type StoredSearch } from '@meith/db'

import { limitMessage, spendLimit } from './antispam'
import { getContainer } from './container'
import { requireSearch, searchScopeFor } from './search'
import { getSettings } from './settings'

export const SEARCH_PAGE = 20

export function searchStore(): PostgresSearchStore | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresSearchStore(getDb())
    : null
}

function newToken(): string {
  return randomBytes(18).toString('base64url')
}

export interface SearchFilters {
  readonly sort: SearchQuery['sort']
  readonly forumIds?: readonly number[] | undefined
  readonly authorUserIds?: readonly number[] | undefined
}

export interface RunSearchInput {
  readonly actor: Actor
  readonly sessionKey: string | null
  readonly terms: string
  readonly filters: SearchFilters
}

export type RunSearchOutcome =
  | { readonly kind: 'ok'; readonly token: string }
  | { readonly kind: 'refused'; readonly reason: 'empty' | 'too-short' | 'too-long' }
  | { readonly kind: 'flooded'; readonly seconds: number }
  | { readonly kind: 'limited'; readonly message: string }

export async function runSearch(input: RunSearchInput): Promise<RunSearchOutcome> {
  const parsed = parseSearchInput(input.terms)
  if (!isRunnable(parsed)) {
    return { kind: 'refused', reason: parsed.refusal ?? 'empty' }
  }

  const store = searchStore()
  if (store === null) throw new ForbiddenError('This board has no search index.')

  const settings = await getSettings()
  const { authorizer } = getContainer()

  const floodSeconds = authorizer.can(input.actor, 'flood.bypass')
    ? 0
    : Number(settings.get('search.flood_seconds') ?? 0)

  const limited = await spendLimit({ scope: 'search', actor: input.actor, settings })
  if (limited !== null && !limited.allowed) {
    return { kind: 'limited', message: limitMessage(limited) }
  }

  const stored = await store.create({
    token: newToken(),
    userId: input.actor.userId,
    sessionKey: input.sessionKey,
    terms: parsed.terms,
    filters: { ...input.filters },
    floodSeconds,
  })

  if (stored === null) return { kind: 'flooded', seconds: floodSeconds }

  return { kind: 'ok', token: stored.token }
}

export interface SearchPageView {
  readonly search: StoredSearch
  readonly results: SearchResults
  readonly filters: SearchFilters
}

export async function openSearch(input: {
  readonly actor: Actor
  readonly sessionKey: string | null
  readonly token: string
  readonly after: SearchQuery['after']
}): Promise<SearchPageView> {
  const store = searchStore()
  if (store === null) throw new NotFoundError('No such search.')

  const search = await store.findByToken(input.token)
  if (search === null) throw new NotFoundError('No such search.')

  if (!ownsSearch(search, { userId: input.actor.userId, sessionKey: input.sessionKey })) {
    throw new NotFoundError('No such search.')
  }

  const filters = readFilters(search.filters)
  const scope = await searchScopeFor(input.actor)

  const results = await requireSearch().search(
    {
      terms: search.terms,
      grouping: 'posts',
      sort: filters.sort,
      limit: SEARCH_PAGE,
      after: input.after,
      ...(filters.forumIds === undefined ? {} : { forumIds: filters.forumIds }),
      ...(filters.authorUserIds === undefined ? {} : { authorUserIds: filters.authorUserIds }),
    },
    scope,
  )

  return { search, results, filters }
}

export function readFilters(raw: Readonly<Record<string, unknown>>): SearchFilters {
  const sort = raw.sort
  const ids = (value: unknown): readonly number[] | undefined =>
    Array.isArray(value) && value.every((entry) => Number.isSafeInteger(entry))
      ? (value as number[])
      : undefined

  return {
    sort: sort === 'newest' || sort === 'oldest' ? sort : 'relevance',
    ...(ids(raw.forumIds) === undefined ? {} : { forumIds: ids(raw.forumIds) }),
    ...(ids(raw.authorUserIds) === undefined ? {} : { authorUserIds: ids(raw.authorUserIds) }),
  }
}
