import 'server-only'

import {
  isRunnable,
  parseSearchInput,
  readGrouping,
  readMatch,
  readPeriod,
  readSort,
  type SearchCursor,
  searchQueryFrom,
} from '@meith/search'

import { filterWords } from '../../view/word-filter'
import { activeWordFilter } from '../content-admin'
import {
  requireSearch,
  requireSearchEnabled,
  searchLanguage,
  searchMinWordLength,
  searchScopeFor,
} from '../search'
import {
  type ApiResult,
  type ApiRoutes,
  badRequest,
  decodeCursor,
  encodeCursor,
  pageLimit,
} from './http'

export const SEARCH_HANDLERS: ApiRoutes = [
  [
    'GET',
    '/search',
    async ({ actor, url }): Promise<ApiResult> => {
      await requireSearchEnabled()

      const minWordLength = await searchMinWordLength()
      const parsed = parseSearchInput(url.searchParams.get('q') ?? '', minWordLength)

      if (!isRunnable(parsed)) {
        return badRequest(
          parsed.refusal === 'too-short'
            ? `That search term is too short — one word in it has to be at least ${minWordLength} characters.`
            : parsed.refusal === 'too-long'
              ? 'That search term is too long.'
              : 'Provide a search term in ?q=.',
        )
      }

      const ids = (key: string): readonly number[] | undefined => {
        const values = url.searchParams
          .getAll(key)
          .map((value) => Number(value))
          .filter((value) => Number.isSafeInteger(value) && value > 0)

        return values.length === 0 ? undefined : values
      }

      const forumIds = ids('forum')
      const authorUserIds = ids('by')

      const results = await requireSearch(await searchLanguage()).search(
        searchQueryFrom(
          parsed.terms,
          {
            sort: readSort(url.searchParams.get('sort')),
            match: readMatch(url.searchParams.get('in')),
            grouping: readGrouping(url.searchParams.get('show')),
            period: readPeriod(url.searchParams.get('when')),
            ...(forumIds === undefined ? {} : { forumIds }),
            ...(authorUserIds === undefined ? {} : { authorUserIds }),
          },
          {
            limit: pageLimit(url),
            after: decodeCursor<SearchCursor>(url.searchParams.get('after')),
            now: new Date(),
          },
        ),
        await searchScopeFor(actor),
      )

      const wordFilter = await activeWordFilter()

      return {
        status: 200,
        body: {
          data: results.hits.map((hit) => ({
            postId: hit.postId,
            threadId: hit.threadId,
            forumId: hit.forumId,
            threadTitle: filterWords(hit.threadTitle, wordFilter),
            authorUserId: hit.authorUserId,
            authorUsername: hit.authorUsername,
            postedAt: hit.postedAt.toISOString(),
            excerpt: filterWords(hit.excerpt, wordFilter),
          })),
          nextCursor: results.nextCursor === null ? null : encodeCursor(results.nextCursor),
        },
      }
    },
  ],
]
