import { describe, expect, it } from 'vitest'

import {
  isRefined,
  narrowFilters,
  narrowerIds,
  narrowerMatch,
  narrowerPeriod,
  periodStart,
  readGrouping,
  readMatch,
  readPeriod,
  readSort,
  trimRefinement,
  type SearchFilterSet,
} from './filters'

const RAN: SearchFilterSet = {
  sort: 'relevance',
  match: 'everything',
  grouping: 'posts',
  period: 'any',
}

const NOW = new Date('2026-03-12T12:00:00Z')

describe('reading a stored or submitted value', () => {
  it('takes a value it knows', () => {
    expect(readSort('newest')).toBe('newest')
    expect(readMatch('titles')).toBe('titles')
    expect(readGrouping('threads')).toBe('threads')
    expect(readPeriod('week')).toBe('week')
  })

  it('falls back rather than refusing anything it does not know', () => {
    for (const value of ['popularity', '', null, undefined, 7, {}]) {
      expect(readSort(value), String(value)).toBe('relevance')
      expect(readMatch(value), String(value)).toBe('everything')
      expect(readGrouping(value), String(value)).toBe('posts')
      expect(readPeriod(value), String(value)).toBe('any')
    }
  })
})

describe('periodStart', () => {
  it('is open-ended for "any"', () => {
    expect(periodStart('any', NOW)).toBeNull()
  })

  it('counts back from the moment the search runs', () => {
    expect(periodStart('day', NOW)).toEqual(new Date('2026-03-11T12:00:00Z'))
    expect(periodStart('week', NOW)).toEqual(new Date('2026-03-05T12:00:00Z'))
  })
})

describe('narrowing', () => {
  it('keeps the shorter window when a refinement meets a stored search', () => {
    expect(narrowerPeriod('any', 'week')).toBe('week')
    expect(narrowerPeriod('week', 'any')).toBe('week')
    expect(narrowerPeriod('month', 'day')).toBe('day')
    expect(narrowerPeriod('day', 'month')).toBe('day')
  })

  it('never widens a titles-only search back to the whole post', () => {
    expect(narrowerMatch('titles', 'everything')).toBe('titles')
    expect(narrowerMatch('everything', 'titles')).toBe('titles')
    expect(narrowerMatch('everything', 'everything')).toBe('everything')
  })

  it('intersects two id lists, and treats an absent one as no constraint', () => {
    expect(narrowerIds([1, 2, 3], [2, 3, 4])).toEqual([2, 3])
    expect(narrowerIds(undefined, [2])).toEqual([2])
    expect(narrowerIds([2], undefined)).toEqual([2])
    expect(narrowerIds(undefined, undefined)).toBeUndefined()
  })

  it('yields an empty list when two id lists share nothing, which matches nothing', () => {
    expect(narrowerIds([1], [2])).toEqual([])
  })
})

describe('narrowFilters', () => {
  it('takes the order and the grouping the refinement asks for', () => {
    const narrowed = narrowFilters(RAN, { sort: 'newest', grouping: 'threads' })

    expect(narrowed.sort).toBe('newest')
    expect(narrowed.grouping).toBe('threads')
  })

  it('never widens what the search was run with', () => {
    const ran: SearchFilterSet = { ...RAN, match: 'titles', period: 'week', forumIds: [1, 2] }
    const narrowed = narrowFilters(ran, { match: 'everything', period: 'year', forumIds: [2, 3] })

    expect(narrowed.match).toBe('titles')
    expect(narrowed.period).toBe('week')
    expect(narrowed.forumIds).toEqual([2])
  })

  it('keeps the author names beside the ids they were resolved from', () => {
    const ran: SearchFilterSet = { ...RAN, authorUserIds: [7], authorNames: ['Marlow'] }

    expect(narrowFilters(ran, {}).authorNames).toEqual(['Marlow'])
  })
})

describe('trimRefinement', () => {
  it('drops a value that only repeats what the search already asked for', () => {
    expect(trimRefinement({ sort: 'relevance', grouping: 'posts' }, RAN)).toEqual({})
    expect(trimRefinement({ forumIds: [3] }, { ...RAN, forumIds: [3] })).toEqual({})
  })

  it('keeps a value that differs, whichever way it differs', () => {
    expect(trimRefinement({ sort: 'newest' }, RAN)).toEqual({ sort: 'newest' })
    expect(trimRefinement({ grouping: 'posts' }, { ...RAN, grouping: 'threads' })).toEqual({
      grouping: 'posts',
    })
  })

  it('leaves a genuinely narrower forum list alone', () => {
    expect(trimRefinement({ forumIds: [3] }, { ...RAN, forumIds: [3, 5] })).toEqual({
      forumIds: [3],
    })
  })

  it('is what makes "is this filtered?" answerable', () => {
    expect(isRefined(trimRefinement({ sort: 'relevance' }, RAN))).toBe(false)
    expect(isRefined(trimRefinement({ sort: 'oldest' }, RAN))).toBe(true)
  })
})
