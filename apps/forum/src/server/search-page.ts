import 'server-only'

/**
 * F73 at the app layer: running a search and re-opening a stored one.
 *
 * The shape of this feature is set by one decision — a stored search holds the
 * **query**, not the hits — and everything here follows from it. Re-opening a
 * search re-runs it against the *current* viewer's scope, so:
 *
 *   - a post deleted since the search was run is simply gone from page two;
 *   - a member who has lost access to a forum stops seeing its hits at once;
 *   - "search within results" is another query rather than a set intersection.
 *
 * The alternative — freezing a list of post ids — is faster on page two and
 * wrong in all three of those ways.
 */
import { randomBytes } from 'node:crypto'

import { ForbiddenError, NotFoundError } from '@meith/core'
import type { Actor } from '@meith/authorization'
import { isRunnable, parseSearchInput, type SearchQuery, type SearchResults } from '@meith/search'
import { PostgresSearchStore, getDb, ownsSearch, type StoredSearch } from '@meith/db'

import { getContainer } from './container'
import { requireSearch, searchScopeFor } from './search'
import { getSettings } from './settings'

/** Results per page. */
export const SEARCH_PAGE = 20

export function searchStore(): PostgresSearchStore | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresSearchStore(getDb())
    : null
}

/**
 * The token in the URL.
 *
 * Random rather than sequential, because a stored search is reachable by anyone
 * holding its address and a countable id would make every member's search terms
 * enumerable. Ownership is checked as well — this is the belt, that is the
 * braces, and neither is sufficient alone: the token protects against guessing,
 * the ownership check against a link being forwarded.
 */
function newToken(): string {
  return randomBytes(18).toString('base64url')
}

/** What the form submitted, as stored and as re-read. */
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

/**
 * Run a search and store it.
 *
 * The flood check happens in the store's insert rather than here, so the check
 * and the write are one statement — search flooding is exactly the traffic that
 * arrives twenty requests at once, and a read-then-write check has a window
 * between them.
 */
export async function runSearch(input: RunSearchInput): Promise<RunSearchOutcome> {
  const parsed = parseSearchInput(input.terms)
  if (!isRunnable(parsed)) {
    return { kind: 'refused', reason: parsed.refusal ?? 'empty' }
  }

  const store = searchStore()
  if (store === null) throw new ForbiddenError('This board has no search index.')

  const settings = await getSettings()
  const { authorizer } = getContainer()

  /*
   * `flood.bypass` is the same global action the posting path asks for, and the
   * interval is a board setting rather than a permission field — see
   * `docs/mybb-parity.md#flood-intervals` for why an interval cannot obey R4.2's
   * numeric rule.
   */
  const floodSeconds = authorizer.can(input.actor, 'flood.bypass')
    ? 0
    : Number(settings.get('search.flood_seconds') ?? 0)

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

/**
 * Re-open a stored search and run one page of it.
 *
 * Refuses a search that is not this viewer's. The results could not leak — they
 * are re-resolved against whoever is asking — but the **terms** are private,
 * and what somebody searched for is frequently more revealing than what they
 * found.
 */
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
    /*
     * Not found rather than forbidden: "this search exists but is not yours"
     * confirms that somebody ran it, which is the fact being protected.
     */
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

/**
 * Read filters back out of the stored JSON.
 *
 * Defensive because the column is `jsonb`: a row hand-edited, or written by an
 * older build, must degrade to a plain relevance search rather than throw at
 * somebody following their own bookmark.
 */
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
