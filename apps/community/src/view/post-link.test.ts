import { describe, expect, it } from 'vitest'

import { locatedHref, postAnchor, postLink } from './post-link'

describe('postAnchor', () => {
  it('names the post by its place in the thread', () => {
    expect(postAnchor(6)).toBe('post-6')
  })
})

describe('postLink', () => {
  it('asks the thread page for one post by id', () => {
    expect(postLink('/thread/15-release', 90)).toBe('/thread/15-release?post=90')
  })

  it('joins a thread href that already carries a query', () => {
    expect(postLink('/thread/15-release?page=2', 90)).toBe('/thread/15-release?page=2&post=90')
  })

  it('drops an anchor the caller was holding, since the page picks one', () => {
    expect(postLink('/thread/15-release#post-2', 90)).toBe('/thread/15-release?post=90')
  })
})

describe('locatedHref', () => {
  const first = { number: 6, page: 1, afterId: null }
  const later = { number: 41, page: 3, afterId: 40 }

  it('anchors the post, and asks for no page when it is on the first', () => {
    expect(locatedHref('/thread/15-release', {}, first)).toBe('/thread/15-release#post-6')
  })

  it('carries the cursor for the page holding it', () => {
    expect(locatedHref('/thread/15-release', {}, later)).toBe(
      '/thread/15-release?after=40&page=3#post-41',
    )
  })

  it('keeps the notices riding along and drops the request that got here', () => {
    expect(locatedHref('/thread/15-release', { post: '90', replied: 'race' }, first)).toBe(
      '/thread/15-release?replied=race#post-6',
    )
  })

  it('replaces a stale cursor rather than adding to it', () => {
    expect(locatedHref('/thread/15-release', { after: '1', page: '9' }, later)).toBe(
      '/thread/15-release?after=40&page=3#post-41',
    )
  })

  it('keeps every value of a repeated parameter', () => {
    expect(locatedHref('/thread/15-release', { reveal: ['4', '5'] }, first)).toBe(
      '/thread/15-release?reveal=4&reveal=5#post-6',
    )
  })
})
