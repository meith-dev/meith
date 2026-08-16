import { describe, expect, it } from 'vitest'

import { compileWordFilter } from '@meith/markdown'
import type { SearchFilterSet, SearchRefinement, SearchSummary } from '@meith/search'

import { buildSearchResultsView, type SearchResultsInput } from './search-results'

const NOW = new Date('2026-03-12T12:00:00Z')

const HIT = {
  postId: 4102,
  threadId: 91,
  threadTitle: 'Bikeshedding the bike shed',
  threadSlug: 'bikeshedding',
  authorUsername: 'Marlow',
  postedAt: new Date('2026-03-12T09:14:00Z'),
  excerpt: 'the <b>teak</b> one',
}

const FILTERS: SearchFilterSet = {
  sort: 'relevance',
  match: 'everything',
  grouping: 'posts',
  period: 'any',
}

const SUMMARY: SearchSummary = {
  total: 2,
  isCapped: false,
  forums: [
    { forumId: 3, hits: 2 },
    { forumId: 5, hits: 1 },
  ],
  authors: [{ userId: 7, username: 'Marlow', hits: 2 }],
}

function build(overrides: Partial<SearchResultsInput> = {}) {
  const refine: SearchRefinement = overrides.refine ?? {}

  return buildSearchResultsView({
    token: 'abc',
    terms: 'teak',
    createdAt: NOW,
    hits: [HIT],
    nextCursor: null,
    pageSize: 20,
    now: NOW,
    filters: FILTERS,
    effective: FILTERS,
    summary: SUMMARY,
    forums: [
      { id: 3, title: 'General discussion' },
      { id: 5, title: 'Woodwork' },
    ],
    countCap: 20_000,
    ...overrides,
    refine,
  })
}

describe('buildSearchResultsView', () => {
  it('resolves each hit to its post inside its thread', () => {
    expect(build().hits[0]?.href).toBe('/thread/91-bikeshedding?post=4102')
  })

  it('passes the engine’s excerpt through, emphasis and all', () => {
    expect(build().hits[0]?.excerptHtml).toBe('the <b>teak</b> one')
  })

  it('applies the board word filter to the excerpt, marks and all', () => {
    const model = build({
      wordFilter: compileWordFilter([
        { pattern: 'teak', replacement: 'oak', wholeWord: true },
      ]),
    })

    expect(model.hits[0]?.excerptHtml).toBe('the <b>oak</b> one')
  })

  it('brings the word back when the filter is removed', () => {
    expect(build().hits[0]?.excerptHtml).toContain('teak')
  })

  it('formats every timestamp in the viewer’s zone', () => {
    const model = build({ timeZone: 'Asia/Tokyo' })

    expect(model.hits[0]?.postedAt.label).toBe('Today, 18:14')
    expect(model.searchedAt.label).toBe('Today, 21:00')
  })

  it('offers no next page when there is none', () => {
    expect(build().nextHref).toBeNull()
  })

  it('says how many the next page holds, so the link is not a mystery', () => {
    const model = build({ nextCursor: { rank: 0.4, postId: 4102 } })

    expect(model.nextLabel).toBe('Next 20 results')
    expect(model.nextHref).toBe('/search/abc?rank=0.4&after=4102')
  })

  it('carries the filters into the next page, so paging does not widen the set', () => {
    const model = build({
      refine: { forumIds: [3], sort: 'newest' },
      nextCursor: { rank: 0, postId: 4102 },
    })

    expect(model.nextHref).toBe('/search/abc?sort=newest&forum=3&rank=0&after=4102')
  })

  it('seeds the narrowing form with the terms and a space to type after', () => {
    expect(build().within.value).toBe('teak ')
  })

  it('carries the search’s own options into a search within it', () => {
    const model = build({
      filters: {
        ...FILTERS,
        sort: 'newest',
        match: 'titles',
        period: 'week',
        forumIds: [3, 5],
        authorNames: ['Marlow'],
      },
    })

    expect(model.within.hidden).toEqual([
      { name: 'forum', value: '3' },
      { name: 'forum', value: '5' },
      { name: 'author', value: 'Marlow' },
      { name: 'when', value: 'week' },
      { name: 'in', value: 'titles' },
      { name: 'sort', value: 'newest' },
    ])
  })

  it('always offers a way back to an empty form', () => {
    expect(build({ hits: [] }).newSearchHref).toBe('/search')
  })
})

describe('the refine panel', () => {
  it('is absent when a search found nothing and nothing is filtering it', () => {
    expect(build({ summary: { total: 0, isCapped: false, forums: [], authors: [] } }).refine)
      .toBeUndefined()
  })

  it('stays when a filter is what emptied the page, so it can be taken off', () => {
    const model = build({
      summary: { total: 0, isCapped: false, forums: [], authors: [] },
      refine: { forumIds: [3] },
    })

    expect(model.refine?.summary).toBe('No posts matched these words.')
    expect(model.refine?.clearHref).toBe('/search/abc')
  })

  it('counts what matched, in the units the search is showing', () => {
    expect(build().refine?.summary).toBe('2 matching posts.')
    expect(
      build({
        effective: { ...FILTERS, grouping: 'threads' },
        summary: { ...SUMMARY, total: 1 },
      }).refine?.summary,
    ).toBe('1 matching thread.')
  })

  it('says when a count is a floor rather than a total', () => {
    const model = build({ summary: { ...SUMMARY, total: 20_000, isCapped: true } })

    expect(model.refine?.summary).toBe('More than 20,000 matching posts.')
    expect(model.refine?.note).toContain('20,000')
  })

  it('names each forum that matched, with how many it holds', () => {
    const forum = build().refine?.choices.find((choice) => choice.field === 'forum')

    expect(forum?.options.map((option) => option.label)).toEqual([
      'Every forum',
      'General discussion (2)',
      'Woodwork (1)',
    ])
  })

  it('offers the order as links, each keeping the filters already on', () => {
    const model = build({ refine: { forumIds: [3] } })

    expect(model.refine?.sorts).toEqual([
      { label: 'Best match', href: '/search/abc?forum=3', isCurrent: true },
      { label: 'Newest first', href: '/search/abc?sort=newest&forum=3', isCurrent: false },
      { label: 'Oldest first', href: '/search/abc?sort=oldest&forum=3', isCurrent: false },
    ])
  })

  it('marks the order the results are in, whoever asked for it', () => {
    const newest = { ...FILTERS, sort: 'newest' } as const
    const model = build({ filters: newest, effective: newest })

    expect(model.refine?.sorts.find((sort) => sort.isCurrent)?.label).toBe('Newest first')
    expect(model.refine?.sorts.find((sort) => sort.label === 'Newest first')?.href).toBe(
      '/search/abc',
    )
  })

  it('leaves the order alone when the filters are cleared', () => {
    const model = build({ refine: { sort: 'newest', forumIds: [3] } })

    expect(model.refine?.clearHref).toBe('/search/abc?sort=newest')
  })

  it('marks the filter that is on', () => {
    const forum = build({ refine: { forumIds: [5] } }).refine?.choices.find(
      (choice) => choice.field === 'forum',
    )

    expect(forum?.options.find((option) => option.isSelected)?.value).toBe('5')
  })

  it('offers every author who posted a match, with a count', () => {
    const author = build().refine?.choices.find((choice) => choice.field === 'by')

    expect(author?.options.map((option) => option.label)).toEqual(['Anybody', 'Marlow (2)'])
  })

  it('offers no window wider than the one the search was run with', () => {
    const model = build({
      filters: { ...FILTERS, period: 'month' },
      effective: { ...FILTERS, period: 'month' },
    })
    const period = model.refine?.choices.find((choice) => choice.field === 'when')

    expect(period?.options.map((option) => option.value)).toEqual(['day', 'week', 'month'])
  })

  it('drops the matching-in control for a search that was titles-only to begin with', () => {
    const titles = { ...FILTERS, match: 'titles' } as const
    const model = build({ filters: titles, effective: titles })

    expect(model.refine?.choices.some((choice) => choice.field === 'in')).toBe(false)
    expect(build().refine?.choices.some((choice) => choice.field === 'in')).toBe(true)
  })

  it('submits back to the results page rather than starting a new search', () => {
    expect(build().refine?.action).toBe('/search/abc')
  })

  it('offers nothing to clear until something is filtering', () => {
    expect(build().refine?.clearHref).toBeNull()
    expect(build({ refine: { sort: 'newest' } }).refine?.clearHref).toBeNull()
    expect(build({ refine: { forumIds: [3] } }).refine?.clearHref).toBe('/search/abc')
  })

  it('gives each applied filter a way off, leaving the others alone', () => {
    const model = build({ refine: { forumIds: [3], authorUserIds: [7], period: 'week' } })

    expect(model.refine?.applied).toEqual([
      { label: 'In General discussion', removeHref: '/search/abc?when=week&by=7' },
      { label: 'By Marlow', removeHref: '/search/abc?when=week&forum=3' },
      { label: 'Past week', removeHref: '/search/abc?forum=3&by=7' },
    ])
  })

  it('names a forum the viewer cannot see rather than dropping the chip', () => {
    const model = build({ refine: { forumIds: [99] }, forums: [] })

    expect(model.refine?.applied[0]?.label).toBe('In forum 99')
  })
})
