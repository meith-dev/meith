import { describe, expect, it } from 'vitest'

import type { CommunityListingRow } from '@meith/communities'

import { buildCommunityDisplayView } from './community-display'

const community: CommunityListingRow = {
  id: 2,
  type: 'community',
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

describe('buildCommunityDisplayView', () => {
  it('keeps deleted authors renderable and supplies the cursor pagination link', () => {
    const view = buildCommunityDisplayView({
      community,
      subcommunities: [],
      page: {
        rows: [
          {
            id: 3,
            communityId: 2,
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
            /* F44's rating aggregate. Zero rather than absent: an unrated
               thread has a real count, and `null` would make every consumer
               handle a state the column cannot hold. */
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

    expect(view.subcommunities).toBeNull()
    expect(view.threads[0]).toMatchObject({
      href: '/thread/3-hello',
      author: { username: 'departed', profileHref: null },
      lastPost: { href: '/thread/3-hello#post-4' },
    })
    expect(view.pagination).toMatchObject({
      page: 1,
      nextHref: '/2-general?after=cursor&page=2',
    })
  })
})
