import { describe, expect, it, vi } from 'vitest'

import type { FeedPost, FeedThread } from '@meith/db'
import { compileWordFilter } from '@meith/markdown'

import { type FeedEntry, renderAtom, renderRss } from '@/view/feed'

vi.mock('@meith/db', () => ({ getDb: () => ({}), PostgresFeedRepository: class {} }))
vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('./settings', () => ({ getSettings: async () => ({ get: () => '' }) }))

const { feedFor } = await import('./feed-builder')

const NOW = new Date('2026-05-05T12:00:00Z')

const FILTER = compileWordFilter([{ pattern: 'slate', replacement: 'shale', wholeWord: true }])

const THREAD: FeedThread = {
  threadId: 91,
  title: 'Bikeshedding',
  slug: 'bikeshedding',
  forumId: 3,
  forumTitle: 'General',
  authorUsername: 'marlow',
  createdAt: NOW,
  lastPostAt: NOW,
  replyCount: 4,
  excerptSource: 'The roof should be slate.',
}

const POST: FeedPost = {
  postId: 4102,
  threadId: 91,
  threadTitle: 'Bikeshedding',
  threadSlug: 'bikeshedding',
  authorUsername: 'marlow',
  createdAt: NOW,
  messageSource: 'The roof should be slate.',
}

function channelOf(entries: readonly FeedEntry[]) {
  return feedFor('https://board.example', undefined).channel({
    title: 'Board',
    description: 'A board',
    path: '/',
    selfPath: '/feed.xml',
    entries,
    now: NOW,
  })
}

describe('feed entries', () => {
  it('applies the board word filter to a thread summary in RSS and Atom', () => {
    const feed = feedFor('https://board.example', FILTER)
    const channel = channelOf([feed.threadEntry(THREAD)])

    expect(renderRss(channel)).toContain('The roof should be shale.')
    expect(renderRss(channel)).not.toContain('slate')
    expect(renderAtom(channel)).toContain('The roof should be shale.')
    expect(renderAtom(channel)).not.toContain('slate')
  })

  it('applies the board word filter to a post summary in RSS and Atom', () => {
    const feed = feedFor('https://board.example', FILTER)
    const channel = channelOf([feed.postEntry(POST)])

    expect(renderRss(channel)).toContain('The roof should be shale.')
    expect(renderRss(channel)).not.toContain('slate')
    expect(renderAtom(channel)).toContain('The roof should be shale.')
    expect(renderAtom(channel)).not.toContain('slate')
  })

  it('brings the word back in both feeds once the filter is removed', () => {
    const feed = feedFor('https://board.example', undefined)
    const channel = channelOf([feed.threadEntry(THREAD), feed.postEntry(POST)])

    expect(renderRss(channel)).toContain('The roof should be slate.')
    expect(renderAtom(channel)).toContain('The roof should be slate.')
    expect(renderRss(channel)).not.toContain('shale')
    expect(renderAtom(channel)).not.toContain('shale')
  })

  it('links a post entry to the post rather than the top of its thread', () => {
    const feed = feedFor('https://board.example', undefined)

    expect(feed.postEntry(POST).href).toBe('https://board.example/thread/91-bikeshedding?post=4102')
  })
})
