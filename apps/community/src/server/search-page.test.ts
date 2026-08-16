import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ForbiddenError, NotFoundError } from '@meith/core'

const search = vi.hoisted(() => ({ enabled: true }))

const SEARCH_OFF = 'Search is switched off on this board.'

vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('./search', () => ({
  requireSearch: () => ({}),
  searchScopeFor: async () => ({}),
  requireSearchEnabled: async () => {
    if (!search.enabled) throw new ForbiddenError(SEARCH_OFF)
  },
}))
vi.mock('./settings', () => ({ getSettings: async () => ({ get: () => 0 }) }))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresSearchStore: class {
    async findByToken(): Promise<null> {
      return null
    }
  },
  SEARCH_WINDOW: 20_000,
  ownsSearch: () => true,
}))

const {
  MAX_AUTHOR_NAMES,
  openSearch,
  parseAuthorNames,
  readFilters,
  readRefinement,
  runSearch,
} = await import('./search-page')

const GUEST = {
  userId: null,
  groupIds: [1],
  primaryGroupId: 1,
  state: 'guest',
  global: {},
  permissionVersion: 1,
} as unknown as Parameters<typeof runSearch>[0]['actor']

beforeEach(() => {
  search.enabled = true
})

describe('the search switch', () => {
  const running = () =>
    runSearch({
      actor: GUEST,
      sessionKey: null,
      terms: 'a',
      authors: '',
      filters: { sort: 'relevance', match: 'everything', grouping: 'posts', period: 'any' },
    })

  const opening = () =>
    openSearch({
      actor: GUEST,
      sessionKey: null,
      token: 'whatever',
      after: null,
      refine: {},
      now: new Date('2026-08-16T00:00:00Z'),
    })

  it('refuses to run a search when it is off', async () => {
    search.enabled = false
    await expect(running()).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('refuses to reopen a search somebody already holds the link to', async () => {
    search.enabled = false
    await expect(opening()).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('is checked before anything else, so nothing is parsed or looked up', async () => {
    search.enabled = false
    await expect(running()).rejects.toBeInstanceOf(ForbiddenError)

    search.enabled = true
    await expect(running()).resolves.toEqual({ kind: 'refused', reason: 'too-short' })
    await expect(opening()).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('readFilters', () => {
  it('reads a stored filter set', () => {
    expect(readFilters({ sort: 'newest', forumIds: [1, 2] })).toEqual({
      sort: 'newest',
      match: 'everything',
      grouping: 'posts',
      period: 'any',
      forumIds: [1, 2],
    })
  })

  it('reads the advanced options a search was run with', () => {
    expect(
      readFilters({
        sort: 'oldest',
        match: 'titles',
        grouping: 'threads',
        period: 'week',
        authorUserIds: [7],
        authorNames: ['Marlow'],
      }),
    ).toEqual({
      sort: 'oldest',
      match: 'titles',
      grouping: 'threads',
      period: 'week',
      authorUserIds: [7],
      authorNames: ['Marlow'],
    })
  })

  it('falls back rather than refusing a filter it does not know', () => {
    expect(readFilters({ sort: 'popularity' }).sort).toBe('relevance')
    expect(readFilters({ match: 'everywhere' }).match).toBe('everything')
    expect(readFilters({ grouping: 'forums' }).grouping).toBe('posts')
    expect(readFilters({ period: 'decade' }).period).toBe('any')
    expect(readFilters({}).sort).toBe('relevance')
  })

  it('drops an id list that is not a list of ids', () => {
    expect(readFilters({ forumIds: 'all' }).forumIds).toBeUndefined()
    expect(readFilters({ forumIds: [1, 'two'] }).forumIds).toBeUndefined()
    expect(readFilters({ authorUserIds: { any: true } }).authorUserIds).toBeUndefined()
    expect(readFilters({ authorNames: [7] }).authorNames).toBeUndefined()
  })

  it('omits absent filters rather than defaulting them to empty', () => {
    const filters = readFilters({})
    expect(filters.forumIds).toBeUndefined()
    expect(filters.authorUserIds).toBeUndefined()
  })

  it('keeps an explicitly empty list distinct from an absent one', () => {
    expect(readFilters({ forumIds: [] }).forumIds).toEqual([])
  })
})

describe('readRefinement', () => {
  it('is empty for a results page nobody has filtered', () => {
    expect(readRefinement({})).toEqual({})
    expect(readRefinement({ rank: '0.4', after: '12' })).toEqual({})
  })

  it('reads every axis the panel submits', () => {
    expect(
      readRefinement({
        sort: 'newest',
        forum: ['3', '5'],
        by: '7',
        when: 'month',
        in: 'titles',
        show: 'threads',
      }),
    ).toEqual({
      sort: 'newest',
      forumIds: [3, 5],
      authorUserIds: [7],
      period: 'month',
      match: 'titles',
      grouping: 'threads',
    })
  })

  it('treats the widest option as no refinement at all', () => {
    expect(readRefinement({ when: 'any', in: 'everything' })).toEqual({})
    expect(readRefinement({ forum: '', by: '' })).toEqual({})
  })

  it('ignores an id that is not one', () => {
    expect(readRefinement({ forum: ['nine', '-1', '4'] }).forumIds).toEqual([4])
    expect(readRefinement({ by: 'me' }).authorUserIds).toBeUndefined()
  })
})

describe('parseAuthorNames', () => {
  it('splits on commas and trims what is left', () => {
    expect(parseAuthorNames('  Marlow , Ann ')).toEqual(['Marlow', 'Ann'])
  })

  it('is empty for an empty field', () => {
    expect(parseAuthorNames('')).toEqual([])
    expect(parseAuthorNames(' , , ')).toEqual([])
  })

  it('stops at the limit rather than running one query per name pasted', () => {
    const many = Array.from({ length: MAX_AUTHOR_NAMES + 3 }, (_, i) => `u${i}`).join(',')
    expect(parseAuthorNames(many)).toHaveLength(MAX_AUTHOR_NAMES)
  })
})
