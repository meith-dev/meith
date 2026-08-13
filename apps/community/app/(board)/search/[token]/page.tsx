import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isAppError } from '@meith/core'
import { requireSlot } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { openSearch, SEARCH_PAGE } from '@/server/search-page'
import { currentSessionKey } from '@/server/session-key'
import { currentTheme } from '@/server/theme'
import { filterView, viewerRef } from '@/server/plugin-view'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildSearchResultsView } from '@/view/search-results'

export const metadata: Metadata = { title: 'Search results' }

export default async function SearchResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const query = await searchParams

  const one = (key: string): string | undefined => {
    const raw = query[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text === undefined || text === '' ? undefined : text
  }

  const rank = Number(one('rank'))
  const postId = Number(one('after'))
  const after =
    Number.isFinite(rank) && Number.isSafeInteger(postId) && postId > 0
      ? { rank, postId }
      : null

  const actor = await getActor()
  const now = new Date()

  let view
  try {
    view = await openSearch({
      actor,
      sessionKey: await currentSessionKey(),
      token,
      after,
    })
  } catch (err) {
    if (isAppError(err)) notFound()
    throw err
  }

  const { search, results } = view
  const { timezone } = await getViewerPreferences()

  const model = buildSearchResultsView({
    terms: search.terms,
    createdAt: search.createdAt,
    hits: results.hits,
    nextHref:
      results.nextCursor === null
        ? null
        : `/search/${token}?rank=${results.nextCursor.rank}&after=${results.nextCursor.postId}`,
    pageSize: SEARCH_PAGE,
    now,
    timeZone: timezone,
  })

  const SearchResults = requireSlot(await currentTheme(), 'SearchResults')

  return <SearchResults {...await filterView('view.search-results', model, viewerRef(actor))} />
}
