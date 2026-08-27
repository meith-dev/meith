import { describe, expect, it } from 'vitest'

import type { ForumListingRow, ForumRow } from '@meith/forums'
import { compileWordFilter } from '@meith/markdown'
import type { SearchFilterSet } from '@meith/search'
import type { SubscriptionRow } from '@meith/subscriptions'
import type { ThreadListingRow } from '@meith/threads'

import { buildBoardIndexView, buildSectionView } from './board-index'
import { buildLatestPostsModel, buildLatestThreadsModel } from './board-latest'
import { buildDiscoveryView } from './discovery-view'
import { buildForumDisplayView } from './forum-display'
import { buildReplyView } from './post-form'
import { buildWhoIsOnlineModel, locationOf } from './presence'
import { buildSearchResultsView } from './search-results'
import { buildSubscriptionsView } from './subscriptions'
import { buildThreadView } from './thread-view'
import { untranslated } from './time'

const NOW = new Date('2026-05-05T12:00:00Z')

const WORD_FILTER = compileWordFilter([
  { pattern: 'bikeshed', replacement: 'roof', wholeWord: false },
])

const SEARCH_FILTERS: SearchFilterSet = {
  sort: 'relevance',
  match: 'everything',
  grouping: 'posts',
  period: 'any',
}

const TITLE = 'The bikeshed question'
const FILTERED = 'The roof question'

const forumRow: ForumRow = {
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

const listingRow: ForumListingRow = {
  ...forumRow,
  allowThreads: true,
  threadCount: 1,
  postCount: 1,
  lastPost: null,
}

const thread: ThreadListingRow = {
  id: 3,
  forumId: 2,
  title: TITLE,
  slug: 'the-bikeshed-question',
  prefix: null,
  authorUserId: 7,
  authorUsername: 'marlow',
  replyCount: 1,
  viewCount: 2,
  ratingTotal: 0,
  ratingCount: 0,
  visibility: 'visible',
  isSticky: false,
  isLocked: false,
  isMoved: false,
  lastPost: { postId: 4, userId: 7, username: 'marlow', at: NOW },
  lastPostAt: NOW,
}

describe('a thread title is rewritten wherever a reader meets one', () => {
  it('as the heading of the thread page', () => {
    const view = buildThreadView({
      thread,
      forum: forumRow,
      page: { rows: [], nextAfterId: null },
      pageNumber: 1,
      nextHref: null,
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(view.view.thread.title).toBe(FILTERED)
  })

  it('in a forum listing, and in the last-post line beside it', () => {
    const view = buildForumDisplayView({
      forum: listingRow,
      subforums: [],
      page: { rows: [thread], nextCursor: null },
      pageNumber: 1,
      nextHref: null,
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(view.threads[0]?.title).toBe(FILTERED)
    expect(view.threads[0]?.lastPost?.threadTitle).toBe(FILTERED)
  })

  it('in the last post shown against a forum on the board index', () => {
    const rows = [
      { ...listingRow, id: 1, type: 'category' as const, title: 'Talk', path: '1' },
      {
        ...listingRow,
        parentId: 1,
        path: '1.2',
        lastPost: {
          threadId: 3,
          threadTitle: TITLE,
          postId: 4,
          userId: 7,
          username: 'marlow',
          at: NOW,
        },
      },
    ]

    const view = buildBoardIndexView({
      rows,
      visibleForumIds: new Set([1, 2]),
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(view.blocks[0]?.forums[0]?.lastPost?.threadTitle).toBe(FILTERED)

    const section = buildSectionView({
      rows,
      visibleForumIds: new Set([1, 2]),
      categoryId: 1,
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(section?.forums[0]?.lastPost?.threadTitle).toBe(FILTERED)
  })

  it('in the latest-threads and latest-posts lists', () => {
    const threads = buildLatestThreadsModel({
      rows: [
        {
          threadId: 3,
          title: TITLE,
          slug: 'the-bikeshed-question',
          forumId: 2,
          forumTitle: 'General',
          forumSlug: 'general',
          authorUserId: 7,
          authorUsername: 'marlow',
          replyCount: 1,
          createdAt: NOW,
        },
      ],
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    const posts = buildLatestPostsModel({
      rows: [
        {
          postId: 4,
          threadId: 3,
          threadTitle: TITLE,
          threadSlug: 'the-bikeshed-question',
          forumId: 2,
          forumTitle: 'General',
          forumSlug: 'general',
          authorUserId: 7,
          authorUsername: 'marlow',
          createdAt: NOW,
          messageSource: 'Nothing to see.',
        },
      ],
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(threads.threads[0]?.title).toBe(FILTERED)
    expect(posts.posts[0]?.threadTitle).toBe(FILTERED)
  })

  it('in the discovery lists', () => {
    const view = buildDiscoveryView({
      view: 'new',
      views: ['new'],
      rows: [
        {
          threadId: 3,
          slug: 'the-bikeshed-question',
          title: TITLE,
          forumId: 2,
          forumSlug: 'general',
          forumTitle: 'General',
          authorUsername: 'marlow',
          replyCount: 1,
          lastPostAt: NOW,
          lastPostUsername: 'marlow',
        },
      ],
      nextHref: null,
      pageSize: 20,
      isFirstPage: true,
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(view.rows[0]?.title).toBe(FILTERED)
  })

  it('in search results, beside the excerpt that was already filtered', () => {
    const view = buildSearchResultsView({
      terms: 'question',
      token: 'abc',
      hits: [
        {
          postId: 4,
          threadId: 3,
          threadTitle: TITLE,
          threadSlug: 'the-bikeshed-question',
          authorUsername: 'marlow',
          postedAt: NOW,
          excerpt: 'a bikeshed of a post',
        },
      ],
      nextCursor: null,
      pageSize: 20,
      filters: SEARCH_FILTERS,
      effective: SEARCH_FILTERS,
      countCap: 20_000,
      summary: { total: 1, isCapped: false, forums: [], authors: [] },
      forums: [],
      refine: {},
      createdAt: NOW,
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(view.hits[0]?.threadTitle).toBe(FILTERED)
    expect(view.hits[0]?.excerptHtml).toBe('a roof of a post')
  })

  it('in the list of threads a member follows, leaving forum names alone', () => {
    const rows: readonly SubscriptionRow[] = [
      {
        target: 'thread',
        targetId: 3,
        title: TITLE,
        href: '/thread/3-the-bikeshed-question',
        mode: 'instant',
        createdAt: NOW,
        pending: 0,
      },
      {
        target: 'forum',
        targetId: 2,
        title: 'The bikeshed forum',
        href: '/2-general',
        mode: 'instant',
        createdAt: NOW,
        pending: 0,
      },
    ]

    const view = buildSubscriptionsView({ rows, now: NOW, wordFilter: WORD_FILTER })

    expect(view.threads[0]?.title).toBe(FILTERED)
    expect(view.forums[0]?.title).toBe('The bikeshed forum')
  })

  it('in what somebody online is said to be reading', () => {
    const row = {
      userId: 7,
      username: 'marlow',
      invisible: false,
      lastSeenAt: NOW,
      forumId: 2,
      forumTitle: 'General',
      threadId: 3,
      threadTitle: TITLE,
      threadSlug: 'the-bikeshed-question',
    }

    expect(locationOf(row, untranslated(), WORD_FILTER).label).toContain(FILTERED)

    const view = buildWhoIsOnlineModel({
      members: [row],
      guestCount: 0,
      recordCount: 1,
      recordAt: NOW,
      now: NOW,
      wordFilter: WORD_FILTER,
    })

    expect(view.members[0]?.location.label).toContain(FILTERED)
  })

  it('in the heading over the reply form', () => {
    const view = buildReplyView({
      thread: { id: 3, title: TITLE, slug: 'the-bikeshed-question' },
      wordFilter: WORD_FILTER,
    })

    expect(view.heading).toContain(FILTERED)
  })

  it('and is left alone when the board holds no filter', () => {
    const view = buildForumDisplayView({
      forum: listingRow,
      subforums: [],
      page: { rows: [thread], nextCursor: null },
      pageNumber: 1,
      nextHref: null,
      now: NOW,
    })

    expect(view.threads[0]?.title).toBe(TITLE)
  })
})
