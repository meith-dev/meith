/**
 * The index sidebar's view models.
 *
 * Four things are worth pinning here, and each of them is a bug somebody would
 * only find on a real board:
 *
 *  - the **post permalink** carries both the query and the fragment, because
 *    the fragment alone lands on page one of a long thread and does nothing;
 *  - a **deleted author** still renders a name, with no link;
 *  - the excerpt is the post's **text**, not its Markdown, and not its HTML;
 *  - `capturedAt` is the render's own clock, which is the only thing on a panel
 *    that refreshes itself saying whether it still is.
 */
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
  communityId: 3,
  communityTitle: 'General',
  communitySlug: 'general',
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
  communityId: 3,
  communityTitle: 'General',
  communitySlug: 'general',
  authorUserId: 12,
  authorUsername: 'marlow',
  createdAt: new Date('2026-05-05T11:55:00Z'),
  messageSource: 'The roof should be **corrugated**, not slate.',
  ...overrides,
})

describe('buildLatestThreadsModel', () => {
  it('resolves the thread, its community and its author', () => {
    const { threads } = buildLatestThreadsModel({ rows: [threadRow()], now: NOW })

    expect(threads[0]).toMatchObject({
      title: 'Bikeshedding',
      href: '/thread/91-bikeshedding',
      community: { label: 'General', href: '/community/3-general' },
      author: { userId: 12, username: 'marlow', profileHref: '/member/12' },
      replyCount: 4,
    })
  })

  it('keeps the name of a deleted author, with nowhere to click', () => {
    /*
     * `UserRefModel` has carried a null `userId` since F29 and every listing on
     * the board renders the name anyway. Kills the mutant that builds
     * `/member/null`, which is a link to a 404 on the front page.
     */
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
    /*
     * Both halves. `?post=` is what opens the *page* the post is on and the
     * fragment is what scrolls to it — a link with only the fragment lands on
     * page one of a forty-page thread and appears to do nothing.
     */
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
    /*
     * An attachment-only post is a real thing on this board. The theme skips
     * the line when the excerpt is empty, which it can only do if this returns
     * a string.
     */
    const { posts } = buildLatestPostsModel({ rows: [postRow({ messageSource: '' })], now: NOW })

    expect(posts[0]?.excerpt).toBe('')
  })

  it('carries the community, because these lists cross the whole board', () => {
    const { posts } = buildLatestPostsModel({ rows: [postRow()], now: NOW })

    expect(posts[0]?.community).toEqual({ label: 'General', href: '/community/3-general' })
  })
})
