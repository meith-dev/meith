import { describe, expect, it } from 'vitest'

import {
  buildLatestPostsModel,
  buildLatestThreadsModel,
  type LatestPostRow,
  type LatestThreadRow,
} from './board-latest'

const NOW = new Date('2026-05-05T12:00:00Z')

const threadRow = (overrides: Partial<LatestThreadRow> = {}): LatestThreadRow => ({
  threadId: 91,
  title: 'Bikeshedding',
  slug: 'bikeshedding',
  forumId: 3,
  forumTitle: 'General',
  forumSlug: 'general',
  authorUserId: 12,
  authorUsername: 'marlow',
  replyCount: 4,
  createdAt: new Date('2026-05-05T11:30:00Z'),
  ...overrides,
})

const postRow = (overrides: Partial<LatestPostRow> = {}): LatestPostRow => ({
  postId: 4102,
  threadId: 91,
  threadTitle: 'Bikeshedding',
  threadSlug: 'bikeshedding',
  forumId: 3,
  forumTitle: 'General',
  forumSlug: 'general',
  authorUserId: 12,
  authorUsername: 'marlow',
  createdAt: new Date('2026-05-05T11:55:00Z'),
  messageSource: 'The roof should be **corrugated**, not slate.',
  ...overrides,
})

describe('buildLatestThreadsModel', () => {
  it('resolves the thread, its forum and its author', () => {
    const { threads } = buildLatestThreadsModel({ rows: [threadRow()], now: NOW })

    expect(threads[0]).toMatchObject({
      title: 'Bikeshedding',
      href: '/thread/91-bikeshedding',
      forum: { label: 'General', href: '/3-general' },
      author: { userId: 12, username: 'marlow', profileHref: '/member/12' },
      replyCount: 4,
    })
  })

  it('keeps the name of a deleted author, with nowhere to click', () => {
    const { threads } = buildLatestThreadsModel({
      rows: [threadRow({ authorUserId: null, authorUsername: 'gone' })],
      now: NOW,
    })

    expect(threads[0]?.author).toMatchObject({
      userId: null,
      username: 'gone',
      profileHref: null,
    })
  })

  it('stamps the render with its own clock', () => {
    const { capturedAt } = buildLatestThreadsModel({ rows: [], now: NOW })

    expect(capturedAt.iso).toBe(NOW.toISOString())
  })

  it('is empty rather than absent when there is nothing to show', () => {
    expect(buildLatestThreadsModel({ rows: [], now: NOW }).threads).toEqual([])
  })
})

describe('buildLatestPostsModel', () => {
  it('links to the post rather than to the top of its thread', () => {
    const { posts } = buildLatestPostsModel({ rows: [postRow()], now: NOW })

    expect(posts[0]?.href).toBe('/thread/91-bikeshedding?post=4102#post-4102')
  })

  it('flattens the Markdown source into text', () => {
    const { posts } = buildLatestPostsModel({ rows: [postRow()], now: NOW })

    expect(posts[0]?.excerpt).toBe('The roof should be corrugated, not slate.')
    expect(posts[0]?.excerpt).not.toContain('**')
  })

  it('cuts a long post rather than carrying the whole of it into a sidebar', () => {
    const { posts } = buildLatestPostsModel({
      rows: [postRow({ messageSource: 'word '.repeat(200) })],
      now: NOW,
    })

    expect(posts[0]!.excerpt.length).toBeLessThan(200)
    expect(posts[0]?.excerpt).toContain('…')
  })

  it('renders an empty excerpt rather than "undefined" for a post with no text', () => {
    const { posts } = buildLatestPostsModel({ rows: [postRow({ messageSource: '' })], now: NOW })

    expect(posts[0]?.excerpt).toBe('')
  })

  it('carries the forum, because these lists cross the whole board', () => {
    const { posts } = buildLatestPostsModel({ rows: [postRow()], now: NOW })

    expect(posts[0]?.forum).toEqual({ label: 'General', href: '/3-general' })
  })
})
