import { describe, expect, it } from 'vitest'

import { RENDER_VERSION } from '@meith/bbcode'
import type { ForumRow } from '@meith/forums'
import type { PostListingRow } from '@meith/posts'
import type { ThreadListingRow } from '@meith/threads'

import { buildThreadView, revealedFrom } from './thread-view'

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
  ratingTotal: 0,
  ratingCount: 0,
  visibility: 'visible',
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
function bodyOf(
  post: Partial<PostListingRow> & Pick<PostListingRow, 'message'>,
): string {
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
    expect(bodyOf({ message: 'a [b]bold[/b] claim' })).toBe(
      'a <strong>bold</strong> claim',
    )
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
    canWarn: false,
    canReport: true,
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
    expect(view.posts[0]!.actions).toMatchObject({
      editHref: null,
      restoreHref: null,
    })
  })

  /*
   * The window is enforced by `PostEditor`; repeating it here only decides
   * whether to *offer* a link that the next screen would refuse.
   */
  it('hides Edit once the window has closed, and keeps it for a moderator', () => {
    const stale = { createdAt: new Date('2026-07-30T08:00:00Z') }
    expect(
      actionsFor(stale, { editWindowMinutes: 30 }).actions.editHref,
    ).toBeNull()
    expect(
      actionsFor(stale, { editWindowMinutes: 30, bypassesWindow: true }).actions
        .editHref,
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
    expect(
      actionsFor({ visibility: 'deleted' }, { softDelete: true }).actions
        .quoteHref,
    ).toBeNull()
    expect(actionsFor({}).actions.quoteHref).toBe(
      '/thread/3-hello/reply?quote=4',
    )
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

describe('the report link (F49)', () => {
  const REPORTER = {
    viewerUserId: 7,
    editOwn: false,
    editOthers: false,
    softDelete: false,
    editWindowMinutes: 0,
    bypassesWindow: false,
    canWarn: false,
    canReport: true,
  }

  function reportHrefFor(
    post: Partial<PostListingRow>,
    capabilities: Partial<typeof REPORTER> = {},
  ): string | null {
    const view = buildThreadView({
      thread,
      forum,
      capabilities: { ...REPORTER, ...capabilities },
      page: {
        rows: [
          {
            id: 4,
            threadId: 3,
            forumId: 2,
            number: 1,
            authorUserId: 99,
            authorUsername: 'someone',
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
      now: new Date('2026-07-30T09:00:00Z'),
    })
    return view.posts[0]!.actions.reportHref
  }

  it('offers Report on somebody else"s post', () => {
    expect(reportHrefFor({})).toBe('/report?kind=post&id=4')
  })

  /*
   * A button that files a complaint about yourself helps nobody except someone
   * flooding the queue.
   */
  it('does not offer it on your own', () => {
    expect(reportHrefFor({ authorUserId: 7 })).toBeNull()
  })

  it('does not offer it to somebody who may not report', () => {
    expect(reportHrefFor({}, { canReport: false })).toBeNull()
  })

  /* A deleted post is on the page only because a moderator is reading it. */
  it('does not offer it on a post nobody else can see', () => {
    expect(reportHrefFor({ visibility: 'deleted' })).toBeNull()
  })
})

describe('ignored posts (F61)', () => {
  function row(overrides: Partial<PostListingRow> = {}): PostListingRow {
    return {
      id: 4,
      threadId: 3,
      forumId: 2,
      number: 1,
      authorUserId: 9,
      authorUsername: 'noisy',
      authorPostCount: 0,
      authorJoinedAt: null,
      message: 'Something.',
      messageHtml: null,
      renderVersion: 0,
      editedAt: null,
      editedByUsername: null,
      editReason: null,
      isFirstPost: true,
      visibility: 'visible',
      createdAt: new Date('2026-07-30T08:41:00Z'),
      ...overrides,
    }
  }

  function build(
    rows: readonly PostListingRow[],
    options: Partial<Parameters<typeof buildThreadView>[0]> = {},
  ) {
    return buildThreadView({
      thread,
      forum,
      page: { rows: [...rows], nextAfterId: null },
      pageNumber: 1,
      nextHref: null,
      now: new Date('2026-07-30T09:00:00Z'),
      capabilities: {
        viewerUserId: 1,
        editOwn: false,
        editOthers: false,
        softDelete: false,
        editWindowMinutes: 0,
        bypassesWindow: false,
        canReport: true,
        canWarn: false,
      },
      currentHref: '/thread/3-a-thread?page=2',
      ...options,
    })
  }

  it('withholds the body rather than hiding it', () => {
    /*
     * The claim that makes this "server-side ignore" rather than a stylesheet:
     * the text is not in the model at all, so nothing a browser does can reveal
     * it. Kills the mutant that sets `ignored` but still renders the body.
     */
    const view = build([row()], { ignoredIds: new Set([9]) })

    expect(view.posts[0]?.bodyHtml).toBe('')
    expect(view.posts[0]?.ignored).toEqual({
      authorUsername: 'noisy',
      revealHref: '/thread/3-a-thread?page=2&reveal=4#post-4',
    })
  })

  it('keeps the post in the page, with its number', () => {
    /*
     * F61's "stable pagination and counts". Filtering the post out instead
     * would give every viewer a different page size and make "#2" mean
     * different posts to different people.
     */
    const view = build(
      [row({ id: 4, number: 1 }), row({ id: 5, number: 2, authorUserId: 8 })],
      {
        ignoredIds: new Set([9]),
      },
    )

    expect(view.posts).toHaveLength(2)
    expect(view.posts.map((post) => post.number)).toEqual([1, 2])
    expect(view.posts[1]?.ignored).toBeNull()
  })

  it('shows it once revealed, and leaves the others hidden', () => {
    const view = build([row({ id: 4, number: 1 }), row({ id: 5, number: 2 })], {
      ignoredIds: new Set([9]),
      revealedPostIds: new Set([4]),
    })

    expect(view.posts[0]?.ignored).toBeNull()
    expect(view.posts[0]?.bodyHtml).not.toBe('')
    expect(view.posts[1]?.ignored).not.toBeNull()
  })

  it('withholds the custom fields with the body', () => {
    /* A postbit field is the author's text too, and leaving it would put
       somebody's signature line back on a post the reader hid. */
    const view = build([row()], {
      ignoredIds: new Set([9]),
      authorFields: new Map([[9, [{ label: 'Steam', value: 'noisy99' }]]]),
    })

    expect(view.posts[0]?.author.fields).toEqual([])
  })

  it('offers no quote link for a hidden post', () => {
    const view = build([row()], {
      ignoredIds: new Set([9]),
      replyHref: '/thread/3-a-thread/reply',
    })

    expect(view.posts[0]?.actions.quoteHref).toBeNull()
  })

  it('hides nothing when nobody is ignored', () => {
    const view = build([row()])
    expect(view.posts[0]?.ignored).toBeNull()
    expect(view.posts[0]?.bodyHtml).not.toBe('')
  })
})

describe('revealedFrom', () => {
  it('reads one value, several, and a comma-separated list', () => {
    expect([...revealedFrom('4')]).toEqual([4])
    expect([...revealedFrom(['4', '5'])]).toEqual([4, 5])
    expect([...revealedFrom('4,5')]).toEqual([4, 5])
  })

  it('drops anything that is not a post id, rather than failing', () => {
    /* The query string is anybody's to write. */
    expect([...revealedFrom('4,nonsense,-1,0')]).toEqual([4])
    expect([...revealedFrom(undefined)]).toEqual([])
  })
})
