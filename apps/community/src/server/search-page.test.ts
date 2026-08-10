import { describe, expect, it, vi } from 'vitest'

vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('./search', () => ({ requireSearch: () => ({}), searchScopeFor: async () => ({}) }))
vi.mock('./settings', () => ({ getSettings: async () => ({ get: () => 0 }) }))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresSearchStore: class {},
  ownsSearch: () => true,
}))

const { readFilters } = await import('./search-page')

describe('readFilters', () => {
  it('reads a stored filter set', () => {
    expect(readFilters({ sort: 'newest', forumIds: [1, 2] })).toEqual({
      sort: 'newest',
      forumIds: [1, 2],
    })
  })

  it('falls back to relevance for an unknown sort', () => {
    expect(readFilters({ sort: 'popularity' }).sort).toBe('relevance')
    expect(readFilters({}).sort).toBe('relevance')
  })

  it('drops an id list that is not a list of ids', () => {
    expect(readFilters({ forumIds: 'all' }).forumIds).toBeUndefined()
    expect(readFilters({ forumIds: [1, 'two'] }).forumIds).toBeUndefined()
    expect(readFilters({ authorUserIds: { any: true } }).authorUserIds).toBeUndefined()
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
