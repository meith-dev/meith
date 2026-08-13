import { describe, expect, it } from 'vitest'

import { buildSearchResultsView } from './search-results'

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

function build(overrides: Partial<Parameters<typeof buildSearchResultsView>[0]> = {}) {
  return buildSearchResultsView({
    terms: 'teak',
    createdAt: NOW,
    hits: [HIT],
    nextHref: null,
    pageSize: 20,
    now: NOW,
    ...overrides,
  })
}

describe('buildSearchResultsView', () => {
  it('resolves each hit to its post inside its thread', () => {
    expect(build().hits[0]?.href).toBe('/thread/91-bikeshedding?post=4102')
  })

  it('passes the engine’s excerpt through, emphasis and all', () => {
    expect(build().hits[0]?.excerptHtml).toBe('the <b>teak</b> one')
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
    expect(build({ nextHref: '/search/abc?rank=1&after=2', pageSize: 20 }).nextLabel).toBe(
      'Next 20 results',
    )
  })

  it('seeds the narrowing form with the terms and a space to type after', () => {
    expect(build().within.value).toBe('teak ')
  })

  it('always offers a way back to an empty form', () => {
    expect(build({ hits: [] }).newSearchHref).toBe('/search')
  })
})
