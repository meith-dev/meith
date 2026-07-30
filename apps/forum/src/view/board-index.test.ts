/**
 * F29 — the board index view model.
 *
 * The cases here are the ones that make a listing wrong rather than ugly: a
 * forum the viewer may not see, a *child* of one, a deleted author, and an empty
 * forum. All four are invisible on the fixture board unless asked for
 * deliberately, and all four are how a real board differs from a demo.
 */

import type { ForumListingRow } from '@forum/forums'
import { describe, expect, it } from 'vitest'

import { buildBoardIndexView } from './board-index'

const NOW = new Date('2026-07-30T12:00:00Z')

function forum(over: Partial<ForumListingRow> & { id: number }): ForumListingRow {
  return {
    type: 'forum',
    title: `Forum ${over.id}`,
    slug: `forum-${over.id}`,
    description: null,
    parentId: null,
    path: String(over.id),
    depth: 0,
    displayOrder: over.id,
    linkUrl: null,
    threadCount: 0,
    postCount: 0,
    lastPost: null,
    ...over,
  }
}

function view(rows: readonly ForumListingRow[], visible: readonly number[]) {
  return buildBoardIndexView({
    rows,
    visibleForumIds: new Set(visible),
    now: NOW,
  })
}

describe('buildBoardIndexView', () => {
  it('groups forums under their top-level block', () => {
    const result = view(
      [
        forum({ id: 1, type: 'category', title: 'Community' }),
        forum({ id: 2, title: 'General', parentId: 1 }),
        forum({ id: 3, title: 'Announcements', parentId: 1 }),
      ],
      [1, 2, 3],
    )

    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]!.block.category.title).toBe('Community')
    expect(result.blocks[0]!.forums.map((f) => f.title)).toEqual([
      'General',
      'Announcements',
    ])
  })

  it('shows a root-level forum as its own block', () => {
    const result = view([forum({ id: 1, title: 'Lonely' })], [1])

    expect(result.blocks[0]!.block.category.title).toBe('Lonely')
    expect(result.blocks[0]!.forums).toEqual([])
  })

  it('omits a forum the viewer cannot see', () => {
    const result = view(
      [
        forum({ id: 1, type: 'category' }),
        forum({ id: 2, title: 'Public', parentId: 1 }),
        forum({ id: 3, title: 'Staff only', parentId: 1 }),
      ],
      [1, 2],
    )

    expect(result.blocks[0]!.forums.map((f) => f.title)).toEqual(['Public'])
  })

  /*
   * The case this file exists for. `buildTree` promotes orphans to roots (D22),
   * so filtering the flat list and building the tree would surface a visible
   * child of a hidden category as a top-level block — telling a guest both that
   * the forum exists and what it is called.
   */
  it('drops a visible child whose parent is hidden, rather than promoting it', () => {
    const result = view(
      [
        forum({ id: 1, type: 'category', title: 'Staff' }),
        forum({ id: 2, title: 'Visible child', parentId: 1 }),
      ],
      [2],
    )

    expect(result.blocks).toEqual([])
  })

  /*
   * One pass is not enough: the grandchild's parent survives the *filter* and is
   * then dropped for being orphaned, so anything hanging off it has to go in a
   * later pass. An implementation that filters once leaves the grandchild as a
   * top-level block — the same leak, one level deeper and much easier to miss.
   */
  it('drops a grandchild whose parent was dropped for being orphaned', () => {
    const result = view(
      [
        forum({ id: 1, type: 'category', title: 'Staff' }),
        forum({ id: 2, title: 'Child', parentId: 1 }),
        forum({ id: 3, title: 'Grandchild', parentId: 2 }),
      ],
      [2, 3],
    )

    expect(result.blocks).toEqual([])
  })

  it('lists deeper forums as subforum links on their parent row', () => {
    const result = view(
      [
        forum({ id: 1, type: 'category' }),
        forum({ id: 2, title: 'General', parentId: 1 }),
        forum({ id: 3, title: 'Off Topic', parentId: 2 }),
      ],
      [1, 2, 3],
    )

    expect(result.blocks[0]!.forums).toHaveLength(1)
    expect(result.blocks[0]!.forums[0]!.subforums).toEqual([
      { label: 'Off Topic', href: '/forum/3-forum-3' },
    ])
  })

  it('formats the last post, and links the thread rather than the forum', () => {
    const result = view(
      [
        forum({
          id: 1,
          lastPost: {
            postId: 99,
            threadId: 7,
            threadTitle: 'Hello',
            userId: 3,
            username: 'ada',
            at: new Date('2026-07-30T09:14:00Z'),
          },
        }),
      ],
      [1],
    )

    const last = result.blocks[0]!.block.category.lastPost!
    expect(last.href).toBe('/thread/7#post-99')
    expect(last.at.label).toBe('Today, 09:14')
    expect(last.author.username).toBe('ada')
  })

  /*
   * `posts.author_user_id` is ON DELETE SET NULL while the username is kept, so
   * a listing must render the name without a link. Assuming an author is always
   * linkable is what turns a deleted account into a broken row.
   */
  it('renders a deleted author by name with no profile link', () => {
    const result = view(
      [
        forum({
          id: 1,
          lastPost: {
            postId: 1,
            threadId: 1,
            threadTitle: 'Old thread',
            userId: null,
            username: 'departed',
            at: NOW,
          },
        }),
      ],
      [1],
    )

    const author = result.blocks[0]!.block.category.lastPost!.author
    expect(author.username).toBe('departed')
    expect(author.userId).toBeNull()
    expect(author.profileHref).toBeNull()
  })

  it('reports no last post for an empty forum', () => {
    const result = view([forum({ id: 1 })], [1])

    expect(result.blocks[0]!.block.category.lastPost).toBeNull()
  })

  it('sends a link forum to its target and everything else to its forum page', () => {
    const result = view(
      [
        forum({ id: 1, type: 'category' }),
        forum({ id: 2, slug: 'general', parentId: 1 }),
        forum({ id: 3, type: 'link', linkUrl: 'https://example.com/docs', parentId: 1 }),
      ],
      [1, 2, 3],
    )

    expect(result.blocks[0]!.forums.map((f) => f.href)).toEqual([
      '/forum/2-general',
      'https://example.com/docs',
    ])
  })

  it('offers no mark-all-read action until read tracking exists', () => {
    expect(view([forum({ id: 1 })], [1]).index.markAllReadAction).toBeNull()
  })

  it('renders an empty board as no blocks rather than throwing', () => {
    expect(view([], []).blocks).toEqual([])
  })
})
