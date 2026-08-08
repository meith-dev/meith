/**
 * F67's URL ↔ filter mapping.
 *
 * The search form is a GET form, so the filter *is* the query string — which
 * means this function is the boundary where anything a person can type into an
 * address bar becomes a database query. Two rules follow, and both are here:
 *
 *  - **an unparseable criterion is dropped, not refused.** A filter is a
 *    question; answering a slightly wrong one with the members it does match is
 *    more use than an error page, and an operator who mistypes a date should
 *    not lose the rest of what they typed;
 *  - **an absent criterion is absent**, not a default value. `undefined` is
 *    what makes `search` leave the clause out; a zero would silently mean
 *    "nobody with fewer than nought posts", which is a different query that
 *    happens to look the same on this board and not on the next one.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresUserAdminRepository: class {},
  PostgresBanRepository: class {},
}))

const { USER_PAGE, nextPageQuery, parseUserFilter } = await import('./user-admin')

describe('parseUserFilter', () => {
  it('is everybody when nothing is given', () => {
    expect(parseUserFilter({})).toEqual({ afterUserId: 0, limit: USER_PAGE })
  })

  it('reads every criterion the form offers', () => {
    const filter = parseUserFilter({
      username: 'ann',
      email: 'example',
      ip: '203.0.113.',
      group: '3',
      state: 'active',
      minPosts: '10',
      maxPosts: '100',
      after: '2026-01-01',
      before: '2026-06-01',
      deleted: '1',
      after_id: '42',
    })

    expect(filter).toMatchObject({
      username: 'ann',
      email: 'example',
      ipPrefix: '203.0.113.',
      primaryGroupId: 3,
      state: 'active',
      minPostCount: 10,
      maxPostCount: 100,
      includeDeleted: true,
      afterUserId: 42,
    })
    expect(filter.registeredAfter?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('drops a criterion it cannot parse, and keeps the rest', () => {
    /*
     * Kills the mutant that throws on a bad value. An operator who mistypes a
     * date should still get the username search they also typed.
     */
    const filter = parseUserFilter({ username: 'ann', before: 'yesterday', group: 'staff' })

    expect(filter.username).toBe('ann')
    expect(filter.registeredBefore).toBeUndefined()
    expect(filter.primaryGroupId).toBeUndefined()
  })

  it('treats a blank field as absent, because an empty input submits one', () => {
    /*
     * A GET form submits every field it has, empty ones included. Reading `''`
     * as a criterion would make the first search after "Clear" match nobody.
     */
    const filter = parseUserFilter({ username: '', email: '   ', group: '' })

    expect(filter).toEqual({ afterUserId: 0, limit: USER_PAGE })
  })

  it('ignores a state that is not one of the three', () => {
    expect(parseUserFilter({ state: 'vanished' }).state).toBeUndefined()
    expect(parseUserFilter({ state: 'banned' }).state).toBe('banned')
  })

  it('refuses a negative cursor rather than paging backwards off the end', () => {
    expect(parseUserFilter({ after_id: '-5' }).afterUserId).toBe(0)
  })

  it('takes the first value when a key is repeated', () => {
    /* `?username=a&username=b` is a URL anybody can construct. */
    expect(parseUserFilter({ username: ['ann', 'bob'] }).username).toBe('ann')
  })
})

describe('nextPageQuery', () => {
  it('keeps every filter and replaces the cursor', () => {
    /*
     * The whole point of paging a *filtered* list: a "next" link that dropped
     * the filter would silently page through everybody instead. Kills the
     * mutant that builds the link from the cursor alone.
     */
    const query = nextPageQuery({ username: 'ann', state: 'active', after_id: '10' }, 60)
    const params = new URLSearchParams(query.slice(1))

    expect(params.get('username')).toBe('ann')
    expect(params.get('state')).toBe('active')
    expect(params.get('after_id')).toBe('60')
  })

  it('drops empty values, so the link is not a wall of blanks', () => {
    const query = nextPageQuery({ username: 'ann', email: '' }, 60)
    expect(query).not.toContain('email')
  })
})
