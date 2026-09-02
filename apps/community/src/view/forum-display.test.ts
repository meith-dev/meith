import { describe, expect, it } from 'vitest'

import type { ForumListingRow } from '@meith/forums'

import { buildForumDisplayView } from './forum-display'

const forum: ForumListingRow = {
  id: 2,
  type: 'forum',
  allowThreads: true,
  title: 'General',
  slug: 'general',
  description: null,
  parentId: null,
  path: '2',
  depth: 0,
  displayOrder: 0,
  linkUrl: null,
  threadCount: 1,
  postCount: 2,
  lastPost: null,
}

describe('buildForumDisplayView', () => {
  it('keeps deleted authors renderable and supplies the cursor pagination link', () => {
    const view = buildForumDisplayView({
      forum,
      subforums: [],
      page: {
        rows: [
          {
            id: 3,
            forumId: 2,
            title: 'Hello',
            slug: 'hello',
            prefix: null,
            authorUserId: null,
            authorUsername: 'departed',
            replyCount: 1,
            viewCount: 2,
            visibility: 'visible',
            isSticky: false,
            isLocked: false,
            isMoved: false,
            ratingTotal: 0,
            ratingCount: 0,
            lastPost: {
              postId: 4,
              userId: null,
              username: 'departed',
              at: new Date('2026-07-30T08:41:00Z'),
            },
            lastPostAt: new Date('2026-07-30T08:41:00Z'),
          },
        ],
        nextCursor: {
          sort: 'activity',
          isSticky: false,
          lastPostAt: new Date('2026-07-30T08:41:00Z'),
          ratingTotal: 0,
          ratingCount: 0,
          id: 3,
        },
      },
      pageNumber: 1,
      nextHref: '/2-general?after=cursor&page=2',
      now: new Date('2026-07-30T09:00:00Z'),
    })

    expect(view.subforums).toBeNull()
    expect(view.threads[0]).toMatchObject({
      href: '/thread/3-hello',
      author: { username: 'departed', profileHref: null },
      lastPost: { href: '/thread/3-hello?post=4' },
      visibility: 'visible',
    })
    expect(view.pagination).toMatchObject({
      page: 1,
      nextHref: '/2-general?after=cursor&page=2',
    })
  })

  it('carries a thread’s deleted state through to the row, for the theme to mark', () => {
    const view = buildForumDisplayView({
      forum,
      subforums: [],
      page: {
        rows: [
          {
            id: 7,
            forumId: 2,
            title: 'Removed',
            slug: 'removed',
            prefix: null,
            authorUserId: 5,
            authorUsername: 'spammer',
            replyCount: 0,
            viewCount: 0,
            visibility: 'deleted',
            isSticky: false,
            isLocked: false,
            isMoved: false,
            ratingTotal: 0,
            ratingCount: 0,
            lastPost: null,
            lastPostAt: new Date('2026-07-30T08:41:00Z'),
          },
        ],
        nextCursor: null,
      },
      pageNumber: 1,
      nextHref: null,
      now: new Date('2026-07-30T09:00:00Z'),
    })

    expect(view.threads[0]?.visibility).toBe('deleted')
  })

  it('sends an unread row through the zero-cost goto=unread resolver', () => {
    const readState = {
      forumReadAt: new Map<number, Date>(),
      threadLastPostId: new Map<number, number>(),
      unreadForumIds: new Set<number>(),
    }

    const view = buildForumDisplayView({
      forum,
      subforums: [],
      page: {
        rows: [
          {
            id: 9,
            forumId: 2,
            title: 'Fresh',
            slug: 'fresh',
            prefix: null,
            authorUserId: 1,
            authorUsername: 'ada',
            replyCount: 0,
            viewCount: 0,
            visibility: 'visible',
            isSticky: false,
            isLocked: false,
            isMoved: false,
            ratingTotal: 0,
            ratingCount: 0,
            lastPost: {
              postId: 40,
              userId: 1,
              username: 'ada',
              at: new Date('2026-07-30T08:41:00Z'),
            },
            lastPostAt: new Date('2026-07-30T08:41:00Z'),
          },
        ],
        nextCursor: null,
      },
      pageNumber: 1,
      nextHref: null,
      readState,
      now: new Date('2026-07-30T09:00:00Z'),
    })

    expect(view.threads[0]).toMatchObject({ isUnread: true, href: '/thread/9-fresh?goto=unread' })
  })

  it('leaves a read row’s href plain', () => {
    const readState = {
      forumReadAt: new Map<number, Date>(),
      threadLastPostId: new Map([[9, 999]]),
      unreadForumIds: new Set<number>(),
    }

    const view = buildForumDisplayView({
      forum,
      subforums: [],
      page: {
        rows: [
          {
            id: 9,
            forumId: 2,
            title: 'Read already',
            slug: 'read-already',
            prefix: null,
            authorUserId: 1,
            authorUsername: 'ada',
            replyCount: 0,
            viewCount: 0,
            visibility: 'visible',
            isSticky: false,
            isLocked: false,
            isMoved: false,
            ratingTotal: 0,
            ratingCount: 0,
            lastPost: {
              postId: 40,
              userId: 1,
              username: 'ada',
              at: new Date('2026-07-30T08:41:00Z'),
            },
            lastPostAt: new Date('2026-07-30T08:41:00Z'),
          },
        ],
        nextCursor: null,
      },
      pageNumber: 1,
      nextHref: null,
      readState,
      now: new Date('2026-07-30T09:00:00Z'),
    })

    expect(view.threads[0]).toMatchObject({ isUnread: false, href: '/thread/9-read-already' })
  })

  it('hydrates a subforum row’s last post and unread flag the same way the board index does', () => {
    const view = buildForumDisplayView({
      forum,
      subforums: [
        {
          ...forum,
          id: 5,
          title: 'Off Topic',
          slug: 'off-topic',
          lastPost: {
            postId: 12,
            threadId: 3,
            threadTitle: 'Chatter',
            userId: 1,
            username: 'ada',
            at: new Date('2026-07-30T08:00:00Z'),
          },
        },
      ],
      page: { rows: [], nextCursor: null },
      pageNumber: 1,
      nextHref: null,
      readState: {
        forumReadAt: new Map<number, Date>(),
        threadLastPostId: new Map<number, number>(),
        unreadForumIds: new Set([5]),
      },
      now: new Date('2026-07-30T09:00:00Z'),
    })

    const subforum = view.subforums?.forums[0]
    expect(subforum?.isUnread).toBe(true)
    expect(subforum?.lastPost).toMatchObject({ threadTitle: 'Chatter', href: '/thread/3?post=12' })
  })
})
