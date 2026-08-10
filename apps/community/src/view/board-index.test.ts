import type { ForumListingRow } from '@meith/forums'
import { describe, expect, it } from 'vitest'

import { buildBoardIndexView, buildSectionView } from './board-index'

const NOW = new Date('2026-07-30T12:00:00Z')

function forum(over: Partial<ForumListingRow> & { id: number }): ForumListingRow {
  return {
    type: 'forum',
    allowThreads: true,
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
        forum({ id: 1, type: 'category', title: 'Forum' }),
        forum({ id: 2, title: 'General', parentId: 1 }),
        forum({ id: 3, title: 'Announcements', parentId: 1 }),
      ],
      [1, 2, 3],
    )

    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]!.block.category.title).toBe('Forum')
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
      { label: 'Off Topic', href: '/3-forum-3' },
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
    expect(last.href).toBe('/thread/7?post=99')
    expect(last.at.label).toBe('Today, 09:14')
    expect(last.author.username).toBe('ada')
    expect(last.author.profileHref).toBe('/member/3')
  })

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
      '/2-general',
      'https://example.com/docs',
    ])
  })

  it('offers no mark-all-read action until read tracking exists', () => {
    expect(view([forum({ id: 1 })], [1]).index.markAllReadAction).toBeNull()
  })

  it('marks the supplied unread forums and exposes the native mark-all target', () => {
    const result = buildBoardIndexView({
      rows: [forum({ id: 1 })],
      visibleForumIds: new Set([1]),
      unreadForumIds: new Set([1]),
      markAllReadAction: '/api/read/all',
      now: new Date('2026-07-30T09:00:00Z'),
    })

    expect(result.blocks[0]?.block.category.isUnread).toBe(true)
    expect(result.index.markAllReadAction).toBe('/api/read/all')
  })

  it('renders an empty board as no blocks rather than throwing', () => {
    expect(view([], []).blocks).toEqual([])
  })
})

describe('buildSectionView', () => {
  const rows = [
    forum({ id: 1, type: 'category', title: 'The board' }),
    forum({ id: 2, title: 'General', parentId: 1, path: '1.2' }),
    forum({ id: 3, title: 'Announcements', parentId: 1, path: '1.3' }),
    forum({ id: 4, title: 'Sub', parentId: 2, path: '1.2.4' }),
    forum({ id: 5, type: 'category', title: 'Elsewhere' }),
  ]

  function section(categoryId: number, visible: readonly number[] = [1, 2, 3, 4, 5]) {
    return buildSectionView({
      rows,
      visibleForumIds: new Set(visible),
      categoryId,
      now: NOW,
    })
  }

  it('lists the forums in that category, and their subforums as links', () => {
    const result = section(1)

    expect(result?.block.category.title).toBe('The board')
    expect(result?.forums.map((entry) => entry.title)).toEqual(['General', 'Announcements'])
    expect(result?.forums[0]?.subforums).toEqual([{ label: 'Sub', href: '/4-forum-4' }])
  })

  it('leaves out a forum the viewer cannot see', () => {
    expect(section(1, [1, 3])?.forums.map((entry) => entry.title)).toEqual(['Announcements'])
  })

  it('answers nothing for a category this viewer cannot see', () => {
    expect(section(1, [5])).toBeNull()
  })

  it('answers for an empty category rather than pretending it is missing', () => {
    expect(section(5)?.forums).toEqual([])
  })
})
