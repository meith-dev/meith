/**
 * F73's filter round-trip.
 *
 * `searches.filters` is `jsonb`, which means the value read back is whatever
 * was written — by this build, by an older one, or by somebody with SQL access.
 * A member following their own bookmark must get a search, not a stack trace,
 * so anything unrecognised degrades to a plain relevance query rather than
 * throwing.
 */
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
    /*
     * Kills the mutant that trusts the stored string. A sort this build does
     * not know would reach the provider and produce SQL it cannot order by.
     */
    expect(readFilters({ sort: 'popularity' }).sort).toBe('relevance')
    expect(readFilters({}).sort).toBe('relevance')
  })

  it('drops an id list that is not a list of ids', () => {
    /*
     * A `jsonb` column can hold anything. A string where an array belongs would
     * become `forum_id in ('…')` — a query error on a page somebody reached
     * from their own history.
     */
    expect(readFilters({ forumIds: 'all' }).forumIds).toBeUndefined()
    expect(readFilters({ forumIds: [1, 'two'] }).forumIds).toBeUndefined()
    expect(readFilters({ authorUserIds: { any: true } }).authorUserIds).toBeUndefined()
  })

  it('omits absent filters rather than defaulting them to empty', () => {
    /*
     * An empty array is not "no filter" — F72 intersects it with the scope, so
     * an empty list would narrow every search to nothing. Absent must stay
     * absent. Kills the mutant that defaults to `[]`.
     */
    const filters = readFilters({})
    expect(filters.forumIds).toBeUndefined()
    expect(filters.authorUserIds).toBeUndefined()
  })

  it('keeps an explicitly empty list distinct from an absent one', () => {
    expect(readFilters({ forumIds: [] }).forumIds).toEqual([])
  })
})
