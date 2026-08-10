import { describe, expect, it } from 'vitest'

import { postAnchor, postLink } from './post-link'

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
