import {
  SEARCH_GROUPINGS,
  SEARCH_MATCHES,
  SEARCH_PERIODS,
  SEARCH_SORTS,
  isRefined,
  narrowerPeriod,
  type SearchCursor,
  type SearchFilterSet,
  type SearchRefinement,
  type SearchSummary,
} from '@meith/search'
import type {
  HiddenFieldModel,
  OptionModel,
  SearchChipModel,
  SearchChoiceModel,
  SearchRefineModel,
  SearchResultsModel,
} from '@meith/theme-kit'

import { postLink } from './post-link'
import {
  GROUPING_LABELS,
  MATCH_LABELS,
  PERIOD_LABELS,
  REFINE_FIELDS,
  SEARCH_FIELDS,
  SORT_LABELS,
  choiceOptions,
  resultsHref,
} from './search-controls'
import { formatTime } from './time'

export interface SearchHitRow {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly authorUsername: string
  readonly postedAt: Date
  readonly excerpt: string
}

export interface SearchForumRef {
  readonly id: number
  readonly title: string
}

export interface SearchResultsInput {
  readonly token: string
  readonly terms: string
  readonly createdAt: Date
  readonly hits: readonly SearchHitRow[]
  readonly nextCursor: SearchCursor | null
  readonly pageSize: number
  readonly now: Date
  readonly timeZone?: string | undefined
  readonly filters: SearchFilterSet
  readonly effective: SearchFilterSet
  readonly refine: SearchRefinement
  readonly summary: SearchSummary
  readonly forums: readonly SearchForumRef[]
  readonly countCap: number
}

export function buildSearchResultsView(input: SearchResultsInput): SearchResultsModel {
  const nextHref =
    input.nextCursor === null ? null : resultsHref(input.token, input.refine, input.nextCursor)

  return {
    terms: input.terms,
    searchedAt: formatTime(input.createdAt, input.now, input.timeZone),
    hits: input.hits.map((hit) => ({
      postId: hit.postId,
      threadTitle: hit.threadTitle,
      href: postLink(`/thread/${hit.threadId}-${hit.threadSlug}`, hit.postId),
      excerptHtml: hit.excerpt,
      authorUsername: hit.authorUsername,
      postedAt: formatTime(hit.postedAt, input.now, input.timeZone),
    })),
    nextHref,
    nextLabel: `Next ${input.pageSize} results`,
    newSearchHref: '/search',
    within: {
      action: '/search',
      field: SEARCH_FIELDS.query,
      value: `${input.terms} `,
      label: 'Search within these results',
      hint: 'Adds your words to the ones above. Everything already typed stays.',
      submitLabel: 'Search within',
      hidden: carriedFilters(input.filters),
    },
    ...(input.summary.total === 0 && !isRefined(input.refine)
      ? {}
      : { refine: buildRefine(input) }),
  }
}

function buildRefine(input: SearchResultsInput): SearchRefineModel {
  const { token, refine, effective, summary } = input
  const href = (next: SearchRefinement): string => resultsHref(token, next)

  return {
    action: `/search/${token}`,
    label: 'Filter and sort these results',
    summary: summaryLine(input),
    note: summary.isCapped
      ? `Counting stops at ${input.countCap.toLocaleString('en')} matches, so the total and the counts below are floors.`
      : null,
    choices: [
      {
        field: REFINE_FIELDS.sort,
        label: 'Sort by',
        options: choiceOptions(SEARCH_SORTS, SORT_LABELS, effective.sort),
      },
      forumChoice(input),
      authorChoice(input),
      {
        field: REFINE_FIELDS.period,
        label: 'Posted',
        options: choiceOptions(
          SEARCH_PERIODS.filter(
            (period) => narrowerPeriod(input.filters.period, period) === period,
          ),
          PERIOD_LABELS,
          effective.period,
        ),
      },
      ...(input.filters.match === 'titles'
        ? []
        : [
            {
              field: REFINE_FIELDS.match,
              label: 'Matching in',
              options: choiceOptions(SEARCH_MATCHES, MATCH_LABELS, effective.match),
            },
          ]),
      {
        field: REFINE_FIELDS.grouping,
        label: 'Show',
        options: choiceOptions(SEARCH_GROUPINGS, GROUPING_LABELS, effective.grouping),
      },
    ],
    submitLabel: 'Apply filters',
    applied: chips(input, href),
    clearHref: isRefined(refine) ? `/search/${token}` : null,
  }
}

function forumChoice(input: SearchResultsInput): SearchChoiceModel {
  const titles = new Map(input.forums.map((forum) => [forum.id, forum.title]))
  const chosen = input.refine.forumIds ?? []

  const options: OptionModel[] = [
    { value: '', label: 'Every forum in this search', isSelected: chosen.length === 0 },
  ]

  for (const facet of input.summary.forums) {
    options.push({
      value: String(facet.forumId),
      label: `${titles.get(facet.forumId) ?? `Forum ${facet.forumId}`} (${facet.hits})`,
      isSelected: chosen.includes(facet.forumId),
    })
  }

  return { field: REFINE_FIELDS.forum, label: 'In', options }
}

function authorChoice(input: SearchResultsInput): SearchChoiceModel {
  const chosen = input.refine.authorUserIds ?? []

  const options: OptionModel[] = [
    { value: '', label: 'Anybody', isSelected: chosen.length === 0 },
  ]

  for (const facet of input.summary.authors) {
    options.push({
      value: String(facet.userId),
      label: `${facet.username} (${facet.hits})`,
      isSelected: chosen.includes(facet.userId),
    })
  }

  return { field: REFINE_FIELDS.author, label: 'Posted by', options }
}

function chips(
  input: SearchResultsInput,
  href: (refine: SearchRefinement) => string,
): SearchChipModel[] {
  const { refine, summary } = input
  const titles = new Map(input.forums.map((forum) => [forum.id, forum.title]))
  const usernames = new Map(summary.authors.map((facet) => [facet.userId, facet.username]))

  const applied: SearchChipModel[] = []

  for (const id of refine.forumIds ?? []) {
    applied.push({
      label: `In ${titles.get(id) ?? `forum ${id}`}`,
      removeHref: href({ ...refine, forumIds: without(refine.forumIds, id) }),
    })
  }

  for (const id of refine.authorUserIds ?? []) {
    applied.push({
      label: `By ${usernames.get(id) ?? `member ${id}`}`,
      removeHref: href({ ...refine, authorUserIds: without(refine.authorUserIds, id) }),
    })
  }

  if (refine.period !== undefined) {
    applied.push({
      label: PERIOD_LABELS[refine.period],
      removeHref: href({ ...refine, period: undefined }),
    })
  }

  if (refine.match !== undefined) {
    applied.push({
      label: MATCH_LABELS[refine.match],
      removeHref: href({ ...refine, match: undefined }),
    })
  }

  if (refine.grouping !== undefined) {
    applied.push({
      label: GROUPING_LABELS[refine.grouping],
      removeHref: href({ ...refine, grouping: undefined }),
    })
  }

  return applied
}

function without(
  ids: readonly number[] | undefined,
  removed: number,
): readonly number[] | undefined {
  const kept = (ids ?? []).filter((id) => id !== removed)
  return kept.length === 0 ? undefined : kept
}

function summaryLine(input: SearchResultsInput): string {
  const { total, isCapped } = input.summary
  const noun = input.effective.grouping === 'threads' ? 'thread' : 'post'

  if (total === 0) return `No ${noun}s matched these words.`

  const counted = `${total.toLocaleString('en')} matching ${noun}${total === 1 ? '' : 's'}`
  return isCapped ? `More than ${counted}.` : `${counted}.`
}

function carriedFilters(filters: SearchFilterSet): HiddenFieldModel[] {
  const carried: HiddenFieldModel[] = []

  for (const id of filters.forumIds ?? []) {
    carried.push({ name: SEARCH_FIELDS.forum, value: String(id) })
  }

  if (filters.authorNames !== undefined && filters.authorNames.length > 0) {
    carried.push({ name: SEARCH_FIELDS.author, value: filters.authorNames.join(', ') })
  }

  if (filters.period !== 'any') carried.push({ name: SEARCH_FIELDS.period, value: filters.period })
  if (filters.match !== 'everything') {
    carried.push({ name: SEARCH_FIELDS.match, value: filters.match })
  }
  if (filters.grouping !== 'posts') {
    carried.push({ name: SEARCH_FIELDS.grouping, value: filters.grouping })
  }
  if (filters.sort !== 'relevance') carried.push({ name: SEARCH_FIELDS.sort, value: filters.sort })

  return carried
}
