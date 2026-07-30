import { describe, expect, it } from 'vitest'

import type { ForumRow } from '@forum/forums'
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
