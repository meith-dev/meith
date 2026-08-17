import { describe, expect, it, vi } from 'vitest'

vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresUserAdminRepository: class {},
  PostgresBanRepository: class {},
}))

const { USER_PAGE, parseUserFilter } = await import('./user-admin')

describe('parseUserFilter', () => {
  it('is everybody when nothing is given', () => {
    expect(parseUserFilter({})).toEqual({ offset: 0, limit: USER_PAGE })
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
      page: '3',
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
      offset: USER_PAGE * 2,
    })
    expect(filter.registeredAfter?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('drops a criterion it cannot parse, and keeps the rest', () => {
    const filter = parseUserFilter({ username: 'ann', before: 'yesterday', group: 'staff' })

    expect(filter.username).toBe('ann')
    expect(filter.registeredBefore).toBeUndefined()
    expect(filter.primaryGroupId).toBeUndefined()
  })

  it('treats a blank field as absent, because an empty input submits one', () => {
    const filter = parseUserFilter({ username: '', email: '   ', group: '' })

    expect(filter).toEqual({ offset: 0, limit: USER_PAGE })
  })

  it('ignores a state that is not one of the three', () => {
    expect(parseUserFilter({ state: 'vanished' }).state).toBeUndefined()
    expect(parseUserFilter({ state: 'banned' }).state).toBe('banned')
  })

  it('refuses a page before the first one rather than counting backwards', () => {
    expect(parseUserFilter({ page: '-5' }).offset).toBe(0)
    expect(parseUserFilter({ page: 'nine' }).offset).toBe(0)
  })

  it('takes the first value when a key is repeated', () => {
    expect(parseUserFilter({ username: ['ann', 'bob'] }).username).toBe('ann')
  })
})
