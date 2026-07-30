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
            editedAt: null,
            editedByUsername: null,
            editReason: null,
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
          editedAt: null,
          editedByUsername: null,
          editReason: null,
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

describe('post affordances (F41)', () => {
  const MEMBER = {
    viewerUserId: 7,
    editOwn: true,
    editOthers: false,
    softDelete: false,
    editWindowMinutes: 0,
    bypassesWindow: false,
  }

  function actionsFor(
    post: Partial<PostListingRow>,
    capabilities: Partial<typeof MEMBER> = {},
  ) {
    const view = buildThreadView({
      thread,
      forum,
      capabilities: { ...MEMBER, ...capabilities },
      page: {
        rows: [
          {
            id: 4,
            threadId: 3,
            forumId: 2,
            number: 1,
            authorUserId: 7,
            authorUsername: 'ada',
            authorPostCount: 1,
            authorJoinedAt: null,
            message: 'body',
            messageHtml: null,
            renderVersion: 0,
            editedAt: null,
            editedByUsername: null,
            editReason: null,
            isFirstPost: false,
            visibility: 'visible',
            createdAt: new Date('2026-07-30T08:41:00Z'),
            ...post,
          },
        ],
        nextAfterId: null,
      },
      pageNumber: 1,
      nextHref: null,
      replyHref: '/thread/3-hello/reply',
      now: new Date('2026-07-30T09:00:00Z'),
    })
    return view.posts[0]!
  }

  it('offers Edit on your own post', () => {
    expect(actionsFor({}).actions.editHref).toBe('/thread/3-hello/edit?post=4')
  })

  it('does not offer Edit on somebody else"s', () => {
    expect(actionsFor({ authorUserId: 99 }).actions.editHref).toBeNull()
  })

  it('offers Edit on somebody else"s to a moderator', () => {
    expect(
      actionsFor({ authorUserId: 99 }, { editOthers: true }).actions.editHref,
    ).toBe('/thread/3-hello/edit?post=4')
  })

  it('offers nothing to a guest', () => {
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
            authorUserId: 7,
            authorUsername: 'ada',
            authorPostCount: 1,
            authorJoinedAt: null,
            message: 'body',
            messageHtml: null,
            renderVersion: 0,
            editedAt: null,
            editedByUsername: null,
            editReason: null,
            isFirstPost: false,
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
    expect(view.posts[0]!.actions).toMatchObject({ editHref: null, restoreHref: null })
  })

  /*
   * The window is enforced by `PostEditor`; repeating it here only decides
   * whether to *offer* a link that the next screen would refuse.
   */
  it('hides Edit once the window has closed, and keeps it for a moderator', () => {
    const stale = { createdAt: new Date('2026-07-30T08:00:00Z') }
    expect(actionsFor(stale, { editWindowMinutes: 30 }).actions.editHref).toBeNull()
    expect(
      actionsFor(stale, { editWindowMinutes: 30, bypassesWindow: true }).actions.editHref,
    ).toBe('/thread/3-hello/edit?post=4')
  })

  it('offers Restore instead of Edit on a deleted post', () => {
    const post = actionsFor({ visibility: 'deleted' }, { softDelete: true })
    expect(post.actions).toMatchObject({
      editHref: null,
      restoreHref: '/thread/3-hello/edit?post=4',
    })
  })

  /*
   * A deleted post's body is on the page only because a moderator is reading
   * it. Offering to quote it would put it back in front of everybody.
   */
  it('does not offer to quote a post nobody else can see', () => {
    expect(actionsFor({ visibility: 'deleted' }, { softDelete: true }).actions.quoteHref).toBeNull()
    expect(actionsFor({}).actions.quoteHref).toBe('/thread/3-hello/reply?quote=4')
  })

  it('carries the edit notice through to the theme', () => {
    const post = actionsFor({
      editedAt: new Date('2026-07-30T08:55:00Z'),
      editedByUsername: 'ada',
      editReason: 'typo',
    })
    expect(post.editedNote).toMatch(/^Last edited by ada on .+: typo$/)
  })
})
