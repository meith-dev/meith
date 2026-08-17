import { describe, expect, it } from 'vitest'

import { buildOffsetPager, buildPager, offsetOf, readPage, readTrail, TRAIL_LIMIT } from './pager'

const BASE = { path: '/admin/users', cursorParams: ['after_id'], pageSize: 50 }

describe('buildPager — the first page', () => {
  it('is page one, with nothing behind it', () => {
    const pager = buildPager({ ...BASE, params: {}, nextCursor: { after_id: '50' } })

    expect(pager.page).toBe(1)
    expect(pager.previousHref).toBeNull()
    expect(pager.nextHref).toBe('/admin/users?after_id=50&seen=after_id%3D50')
  })

  it('knows there is nothing after it when the list ended', () => {
    const pager = buildPager({ ...BASE, params: {}, nextCursor: null })

    expect(pager.nextHref).toBeNull()
    expect(pager.pageCount).toBe(1)
  })

  it('keeps the filter in every link it builds', () => {
    const pager = buildPager({
      ...BASE,
      params: { username: 'ada', group: '3' },
      nextCursor: { after_id: '50' },
    })

    expect(pager.nextHref).toContain('username=ada')
    expect(pager.nextHref).toContain('group=3')
  })
})

describe('buildPager — walking forward and back', () => {
  const third = buildPager({
    ...BASE,
    params: { after_id: '100', seen: 'after_id=50~after_id=100' },
    nextCursor: { after_id: '150' },
  })

  it('counts the pages from the trail it was handed', () => {
    expect(third.page).toBe(3)
  })

  it('goes back to the page before it', () => {
    expect(third.previousHref).toBe('/admin/users?after_id=50&seen=after_id%3D50')
  })

  it('offers every page already walked through, and no invented one', () => {
    expect(third.pages.map((entry) => entry.page)).toEqual([1, 2, 3])
    expect(third.pages.find((entry) => entry.isCurrent)?.page).toBe(3)
  })

  it('sends page one back to a bare address', () => {
    expect(third.pages[0]?.href).toBe('/admin/users')
  })

  it('carries the trail onward', () => {
    const seen = new URL(third.nextHref as string, 'https://board.test').searchParams

    expect(seen.get('after_id')).toBe('150')
    expect(seen.get('seen')).toBe('after_id=50~after_id=100~after_id=150')
  })

  it('rewrites every part of a cursor rather than half of it', () => {
    const search = buildPager({
      path: '/search/abc',
      params: { rank: '0.9', after: '10', sort: 'newest' },
      cursorParams: ['rank', 'after'],
      nextCursor: { rank: '0.4', after: '4102' },
    })

    const next = new URL(search.nextHref as string, 'https://board.test').searchParams
    expect(next.get('rank')).toBe('0.4')
    expect(next.get('after')).toBe('4102')
    expect(next.get('sort')).toBe('newest')
  })
})

describe('buildPager — how much it claims to know', () => {
  it('will not claim a page count it has not been told', () => {
    const pager = buildPager({ ...BASE, params: {}, nextCursor: { after_id: '50' } })

    expect(pager.pageCountIsExact).toBe(false)
    expect(pager.pageCount).toBe(2)
  })

  it('counts the pages exactly when it knows the total', () => {
    const pager = buildPager({ ...BASE, params: {}, nextCursor: { after_id: '50' }, total: 120 })

    expect(pager.pageCountIsExact).toBe(true)
    expect(pager.pageCount).toBe(3)
  })

  it('is one page, not zero, when the list is empty', () => {
    const pager = buildPager({ ...BASE, params: {}, nextCursor: null, total: 0 })
    expect(pager.pageCount).toBe(1)
  })
})

describe('the trail', () => {
  it('drops the oldest entries rather than growing without end', () => {
    const long = Array.from({ length: TRAIL_LIMIT + 10 }, (_, index) => `after_id=${index}`)
    expect(readTrail({ seen: long.join('~') })).toHaveLength(TRAIL_LIMIT)
  })

  it('ignores an empty trail', () => {
    expect(readTrail({ seen: '' })).toEqual([])
    expect(readTrail({})).toEqual([])
  })
})

describe('buildOffsetPager', () => {
  const BASE = { path: '/admin/users', pageSize: 20, total: 204 }

  it('counts the pages from the total', () => {
    const pager = buildOffsetPager({ ...BASE, params: {}, page: 1 })

    expect(pager.pageCount).toBe(11)
    expect(pager.pageCountIsExact).toBe(true)
  })

  it('links straight to any page, not just the next one', () => {
    const pager = buildOffsetPager({ ...BASE, params: {}, page: 6 })

    expect(pager.pages.map((entry) => entry.page)).toEqual([1, 4, 5, 6, 7, 8, 11])
    expect(pager.pages.at(-1)?.href).toBe('/admin/users?page=11')
  })

  it('leaves the page out of the first page’s address', () => {
    expect(buildOffsetPager({ ...BASE, params: {}, page: 2 }).previousHref).toBe('/admin/users')
  })

  it('keeps the filter on every page', () => {
    const pager = buildOffsetPager({ ...BASE, params: { username: 'ada' }, page: 2 })
    expect(pager.nextHref).toBe('/admin/users?username=ada&page=3')
  })

  it('has no next on the last page and no previous on the first', () => {
    expect(buildOffsetPager({ ...BASE, params: {}, page: 11 }).nextHref).toBeNull()
    expect(buildOffsetPager({ ...BASE, params: {}, page: 1 }).previousHref).toBeNull()
  })

  it('keeps a page past the end, and offers the last one that exists', () => {
    const beyond = buildOffsetPager({ ...BASE, params: {}, page: 99 })

    expect(beyond.page, 'the rows really are empty; saying page 1 would be a lie').toBe(99)
    expect(beyond.pageCount).toBe(11)
    expect(beyond.previousHref).toBe('/admin/users?page=11')
    expect(beyond.nextHref).toBeNull()
    expect(beyond.pages.map((entry) => entry.page)).toEqual([1, 9, 10, 11])
  })

  it('is one page when nothing matched', () => {
    const pager = buildOffsetPager({ ...BASE, params: {}, page: 1, total: 0 })
    expect(pager.pageCount).toBe(1)
    expect(pager.nextHref).toBeNull()
  })
})

describe('readPage', () => {
  it('starts at one, and refuses nonsense', () => {
    expect(readPage({})).toBe(1)
    expect(readPage({ page: '7' })).toBe(7)
    expect(readPage({ page: '0' })).toBe(1)
    expect(readPage({ page: '-3' })).toBe(1)
    expect(readPage({ page: 'nine' })).toBe(1)
  })

  it('counts rows from the page', () => {
    expect(offsetOf(1, 50)).toBe(0)
    expect(offsetOf(4, 50)).toBe(150)
  })
})
