import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isAppError } from '@meith/core'
import { requireSlot } from '@meith/theme-kit'

import { SearchOffNotice } from '@/components/board/search-off-notice'
import { getContainer } from '@/server/container'
import { activeWordFilter } from '@/server/content-admin'
import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { SEARCH_OFF_MESSAGE, searchEnabled } from '@/server/search'
import { openSearch, readRefinement, SEARCH_COUNT_CAP, SEARCH_PAGE } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'
import { currentTheme } from '@/server/theme'
import { buildOffsetPager, offsetOf, readPage } from '@/view/pager'
import { CURSOR_FIELDS } from '@/view/search-controls'
import { buildSearchResultsView, type SearchForumRef } from '@/view/search-results'

export const metadata: Metadata = { title: 'Search results' }

export default async function SearchResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await searchEnabled())) return <SearchOffNotice message={SEARCH_OFF_MESSAGE} />

  const { token } = await params
  const query = await searchParams

  const one = (key: string): string | undefined => {
    const raw = query[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text === undefined || text === '' ? undefined : text
  }

  const rank = Number(one(CURSOR_FIELDS.rank))
  const postId = Number(one(CURSOR_FIELDS.after))
  const after =
    Number.isFinite(rank) && Number.isSafeInteger(postId) && postId > 0 ? { rank, postId } : null

  const pageNumber = readPage(query)

  const actor = await getActor()
  const now = new Date()

  let view: Awaited<ReturnType<typeof openSearch>>
  try {
    view = await openSearch({
      actor,
      sessionKey: await currentSessionKey(),
      token,
      after,
      offset: offsetOf(pageNumber, SEARCH_PAGE),
      refine: readRefinement(query),
      now,
    })
  } catch (err) {
    if (isAppError(err)) notFound()
    throw err
  }

  const { search, results, summary, filters, effective, refine } = view
  const translator = await getTranslator()

  const model = buildSearchResultsView({
    token,
    terms: search.terms,
    createdAt: search.createdAt,
    hits: results.hits,
    nextCursor: results.nextCursor,
    pageSize: SEARCH_PAGE,
    now,
    t: translator,
    filters,
    effective,
    refine,
    summary,
    forums: await namedForums(),
    countCap: SEARCH_COUNT_CAP,
    wordFilter: await activeWordFilter(),
  })

  const SearchResults = requireSlot(await currentTheme(), 'SearchResults')
  const Pagination = requireSlot(await currentTheme(), 'Pagination')

  const pager = buildOffsetPager({
    path: `/search/${token}`,
    params: query,
    page: pageNumber,
    pageSize: SEARCH_PAGE,
    total: summary.total,
  })

  const filtered = await filterView('view.search-results', model, viewerRef(actor))

  return (
    <SearchResults
      {...filtered}
      regions={{
        pagination: (
          <Pagination {...(await filterView('view.pagination', pager, viewerRef(actor)))} />
        ),
      }}
    />
  )
}

async function namedForums(): Promise<readonly SearchForumRef[]> {
  const { forums } = getContainer()
  return (await forums.listAll()).map((forum) => ({ id: forum.id, title: forum.title }))
}
