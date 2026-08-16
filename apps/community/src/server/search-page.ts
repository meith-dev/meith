import 'server-only'

import { randomBytes } from 'node:crypto'

import { foldIdentifier } from '@meith/accounts'
import { ForbiddenError, NotFoundError } from '@meith/core'
import type { Actor } from '@meith/authorization'
import {
  isRefined,
  isRunnable,
  narrowFilters,
  parseSearchInput,
  readGrouping,
  readMatch,
  readPeriod,
  readSort,
  searchQueryFrom,
  trimRefinement,
  type SearchCursor,
  type SearchFilterSet,
  type SearchRefinement,
  type SearchResults,
  type SearchSummary,
} from '@meith/search'
import {
  PostgresSearchStore,
  SEARCH_WINDOW,
  getDb,
  ownsSearch,
  type StoredSearch,
} from '@meith/db'

import { REFINE_FIELDS } from '@/view/search-controls'

import { limitMessage, spendLimit } from './antispam'
import { getContainer } from './container'
import {
  requireSearch,
  requireSearchEnabled,
  searchMinWordLength,
  searchScopeFor,
} from './search'
import { getSettings } from './settings'

export const SEARCH_PAGE = 20

export const MAX_AUTHOR_NAMES = 5

export const SEARCH_COUNT_CAP = SEARCH_WINDOW

export function searchStore(): PostgresSearchStore | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresSearchStore(getDb())
    : null
}

function newToken(): string {
  return randomBytes(18).toString('base64url')
}

export interface RunSearchInput {
  readonly actor: Actor
  readonly sessionKey: string | null
  readonly terms: string
  readonly filters: Omit<SearchFilterSet, 'authorUserIds' | 'authorNames'>
  readonly authors: string
}

export type RunSearchOutcome =
  | { readonly kind: 'ok'; readonly token: string }
  | {
      readonly kind: 'refused'
      readonly reason: 'empty' | 'too-short' | 'too-long'
      readonly minWordLength: number
    }
  | { readonly kind: 'flooded'; readonly seconds: number }
  | { readonly kind: 'limited'; readonly message: string }
  | { readonly kind: 'unknown-author'; readonly name: string }

export async function runSearch(input: RunSearchInput): Promise<RunSearchOutcome> {
  await requireSearchEnabled()

  const minWordLength = await searchMinWordLength()

  const parsed = parseSearchInput(input.terms, minWordLength)
  if (!isRunnable(parsed)) {
    return { kind: 'refused', reason: parsed.refusal ?? 'empty', minWordLength }
  }

  const store = searchStore()
  if (store === null) throw new ForbiddenError('This board has no search index.')

  const authors = await resolveAuthors(parseAuthorNames(input.authors))
  if (authors.kind === 'unknown') return { kind: 'unknown-author', name: authors.name }

  const settings = await getSettings()
  const { authorizer } = getContainer()

  const floodSeconds = authorizer.can(input.actor, 'flood.bypass')
    ? 0
    : Number(settings.get('search.flood_seconds') ?? 0)

  const limited = await spendLimit({ scope: 'search', actor: input.actor, settings })
  if (limited !== null && !limited.allowed) {
    return { kind: 'limited', message: limitMessage(limited) }
  }

  const filters: SearchFilterSet = {
    ...input.filters,
    ...(authors.ids.length === 0
      ? {}
      : { authorUserIds: authors.ids, authorNames: authors.names }),
  }

  const stored = await store.create({
    token: newToken(),
    userId: input.actor.userId,
    sessionKey: input.sessionKey,
    terms: parsed.terms,
    filters: { ...filters },
    floodSeconds,
  })

  if (stored === null) return { kind: 'flooded', seconds: floodSeconds }

  return { kind: 'ok', token: stored.token }
}

export interface SearchPageView {
  readonly search: StoredSearch
  readonly results: SearchResults
  readonly summary: SearchSummary
  readonly filters: SearchFilterSet
  readonly effective: SearchFilterSet
  readonly refine: SearchRefinement
}

export async function openSearch(input: {
  readonly actor: Actor
  readonly sessionKey: string | null
  readonly token: string
  readonly after: SearchCursor | null
  readonly offset?: number
  readonly refine: SearchRefinement
  readonly now: Date
}): Promise<SearchPageView> {
  await requireSearchEnabled()

  const store = searchStore()
  if (store === null) throw new NotFoundError('No such search.')

  const search = await store.findByToken(input.token)
  if (search === null) throw new NotFoundError('No such search.')

  if (!ownsSearch(search, { userId: input.actor.userId, sessionKey: input.sessionKey })) {
    throw new NotFoundError('No such search.')
  }

  const filters = readFilters(search.filters)
  const refine = trimRefinement(input.refine, filters)
  const effective = narrowFilters(filters, refine)
  const scope = await searchScopeFor(input.actor)
  const provider = requireSearch()

  const [results, summary] = await Promise.all([
    provider.search(
      searchQueryFrom(search.terms, effective, {
        limit: SEARCH_PAGE,
        after: input.after,
        ...(input.offset === undefined ? {} : { offset: input.offset }),
        now: input.now,
      }),
      scope,
    ),
    provider.summarize(
      searchQueryFrom(search.terms, facetFilters(filters, refine), {
        limit: SEARCH_PAGE,
        after: null,
        now: input.now,
      }),
      scope,
    ),
  ])

  if (!isRefined(refine) && search.hitCount !== summary.total) {
    await store.recordHitCount(search.id, summary.total)
  }

  return { search, results, summary, filters, effective, refine }
}

function facetFilters(filters: SearchFilterSet, refine: SearchRefinement): SearchFilterSet {
  return narrowFilters(filters, {
    ...refine,
    forumIds: undefined,
    authorUserIds: undefined,
  })
}

export function readFilters(raw: Readonly<Record<string, unknown>>): SearchFilterSet {
  const forumIds = ids(raw.forumIds)
  const authorUserIds = ids(raw.authorUserIds)
  const authorNames = names(raw.authorNames)

  return {
    sort: readSort(raw.sort),
    match: readMatch(raw.match),
    grouping: readGrouping(raw.grouping),
    period: readPeriod(raw.period),
    ...(forumIds === undefined ? {} : { forumIds }),
    ...(authorUserIds === undefined ? {} : { authorUserIds }),
    ...(authorNames === undefined ? {} : { authorNames }),
  }
}

export function readRefinement(
  params: Readonly<Record<string, string | string[] | undefined>>,
): SearchRefinement {
  const many = (key: string): readonly string[] => {
    const raw = params[key]
    if (raw === undefined) return []
    return (Array.isArray(raw) ? raw : [raw]).filter((value) => value !== '')
  }
  const one = (key: string): string | undefined => many(key)[0]

  const chosen = (key: string): readonly number[] | undefined => {
    const values = many(key)
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0)

    return values.length === 0 ? undefined : values
  }

  const forumIds = chosen(REFINE_FIELDS.forum)
  const authorUserIds = chosen(REFINE_FIELDS.author)

  const sort = one(REFINE_FIELDS.sort)
  const grouping = one(REFINE_FIELDS.grouping)
  const match = one(REFINE_FIELDS.match)
  const period = one(REFINE_FIELDS.period)

  return {
    ...(sort === undefined ? {} : { sort: readSort(sort) }),
    ...(grouping === undefined ? {} : { grouping: readGrouping(grouping) }),
    ...(match === undefined || readMatch(match) === 'everything'
      ? {}
      : { match: readMatch(match) }),
    ...(period === undefined || readPeriod(period) === 'any'
      ? {}
      : { period: readPeriod(period) }),
    ...(forumIds === undefined ? {} : { forumIds }),
    ...(authorUserIds === undefined ? {} : { authorUserIds }),
  }
}

export function parseAuthorNames(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .slice(0, MAX_AUTHOR_NAMES)
}

async function resolveAuthors(
  wanted: readonly string[],
): Promise<
  | { readonly kind: 'ok'; readonly ids: readonly number[]; readonly names: readonly string[] }
  | { readonly kind: 'unknown'; readonly name: string }
> {
  if (wanted.length === 0) return { kind: 'ok', ids: [], names: [] }

  const { accountStore } = getContainer()
  const ids: number[] = []
  const found: string[] = []

  for (const name of wanted) {
    const account = await accountStore.accounts.findByUsernameLower(foldIdentifier(name))
    if (account === null) return { kind: 'unknown', name }
    ids.push(account.id)
    found.push(account.username)
  }

  return { kind: 'ok', ids, names: found }
}

function ids(value: unknown): readonly number[] | undefined {
  return Array.isArray(value) && value.every((entry) => Number.isSafeInteger(entry))
    ? (value as number[])
    : undefined
}

function names(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? (value as string[])
    : undefined
}
