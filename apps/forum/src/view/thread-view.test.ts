import { describe, expect, it } from 'vitest'

import { RENDER_VERSION } from '@forum/bbcode'
import type { ForumRow } from '@forum/forums'
import type { PostListingRow } from '@forum/posts'
import type { ThreadListingRow } from '@forum/threads'

import { buildThreadView } from './thread-view'

const forum: ForumRow = {
  id: 2,
  type: 'forum',
  title: 'General',
  slug: 'general',
  description: null,
  parentId: null,
  path: '2',
  depth: 0,
  displayOrder: 0,
  linkUrl: null,
}

const thread: ThreadListingRow = {
  id: 3,
  forumId: 2,
  title: 'Hello',
  slug: 'hello',
  prefix: null,
  authorUserId: null,
  authorUsername: 'departed',
  replyCount: 1,
  viewCount: 2,
  isSticky: false,
  isLocked: false,
  isMoved: false,
  lastPost: null,
  lastPostAt: new Date('2026-07-30T08:41:00Z'),
}

describe('buildThreadView', () => {
  it('escapes raw text before the post slot treats it as HTML', () => {
    const view = buildThreadView({
      thread,
      forum,
      page: {
        rows: [
          {
            id: 4,
            threadId: 3,
            forumId: 2,
            number: 1,
            authorUserId: null,
            authorUsername: 'departed',
            authorPostCount: 0,
            authorJoinedAt: null,
            message: '<script>alert(1)</script>\nHello',
            messageHtml: null,
            renderVersion: 0,
            isFirstPost: true,
            visibility: 'visible',
            createdAt: new Date('2026-07-30T08:41:00Z'),
          },
        ],
        nextAfterId: null,
      },
      pageNumber: 1,
      nextHref: null,
      now: new Date('2026-07-30T09:00:00Z'),
    })

    expect(view.posts[0]).toMatchObject({
      permalink: '/thread/3-hello#post-4',
      bodyHtml: '&lt;script&gt;alert(1)&lt;/script&gt;<br>\nHello',
      author: { username: 'departed', profileHref: null },
    })
  })
})

/** One post through the view, so the body tests read as one line each. */
function bodyOf(post: Partial<PostListingRow> & Pick<PostListingRow, 'message'>): string {
  const view = buildThreadView({
    thread,
    forum,
    page: {
      rows: [
        {
          id: 4,
          threadId: 3,
          forumId: 2,
          number: 1,
          authorUserId: null,
          authorUsername: 'departed',
          authorPostCount: 0,
          authorJoinedAt: null,
          messageHtml: null,
          renderVersion: 0,
          isFirstPost: true,
          visibility: 'visible',
          createdAt: new Date('2026-07-30T08:41:00Z'),
          ...post,
        },
      ],
      nextAfterId: null,
    },
    pageNumber: 1,
    nextHref: null,
    now: new Date('2026-07-30T09:00:00Z'),
  })
  return view.posts[0]!.bodyHtml
}

describe('the post body (F36)', () => {
  it('renders BBCode when the post carries no stored render', () => {
    expect(bodyOf({ message: 'a [b]bold[/b] claim' })).toBe('a <strong>bold</strong> claim')
  })

  it('uses the stored render when it is at the current version', () => {
    expect(
      bodyOf({
        message: '[b]ignored[/b]',
        messageHtml: '<em>stored</em>',
        renderVersion: RENDER_VERSION,
      }),
    ).toBe('<em>stored</em>')
  })

  /*
   * The property that makes an escaping fix deployable: a render from an older
   * version of the renderer is not shown, whatever it contains. Without it a
   * fix would only reach readers after the backfill had rewritten every post on
   * the board.
   */
  it('ignores a render an older version of the renderer produced', () => {
    expect(
      bodyOf({
        message: 'safe',
        messageHtml: '<script>alert(1)</script>',
        renderVersion: RENDER_VERSION - 1,
      }),
    ).toBe('safe')
  })
})
