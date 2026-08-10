import { describe, expect, it } from 'vitest'

import { acceptsThreads, canHoldThreads } from './placement'

describe('canHoldThreads', () => {
  it('is true of anything a thread could be filed under', () => {
    expect(canHoldThreads('forum')).toBe(true)
    expect(canHoldThreads('category')).toBe(true)
  })

  it('is false of a link, which is an address rather than a place', () => {
    expect(canHoldThreads('link')).toBe(false)
  })
})

describe('acceptsThreads', () => {
  it('takes every forum at its own word', () => {
    expect(acceptsThreads({ type: 'forum', allowThreads: true })).toBe(true)
    expect(acceptsThreads({ type: 'forum', allowThreads: false })).toBe(true)
  })

  it('takes a category only once an admin has opened it', () => {
    expect(acceptsThreads({ type: 'category', allowThreads: false })).toBe(false)
    expect(acceptsThreads({ type: 'category', allowThreads: true })).toBe(true)
  })

  it('never takes a link, whatever the row says', () => {
    expect(acceptsThreads({ type: 'link', allowThreads: true })).toBe(false)
  })
})
