import { describe, expect, it } from 'vitest'

import { buildBreadcrumb, type CrumbForum } from './breadcrumb'

const FORUMS: CrumbForum[] = [
  { id: 1, slug: 'community', title: 'Community', path: '1' },
  { id: 4, slug: 'general', title: 'General', path: '1.4' },
  { id: 9, slug: 'off-topic', title: 'Off topic', path: '1.4.9' },
  { id: 2, slug: 'staff', title: 'Staff', path: '2' },
  { id: 7, slug: 'staff-room', title: 'Staff room', path: '2.7' },
]

const labels = (items: readonly { label: string }[]) => items.map((item) => item.label)

describe('buildBreadcrumb', () => {
  it('runs root first and ends at the forum', () => {
    const trail = buildBreadcrumb({ forums: FORUMS, forumId: 9 })
    expect(labels(trail)).toEqual(['Forums', 'Community', 'General', 'Off topic'])
    expect(trail.map((item) => item.href)).toEqual([
      '/',
      '/forum/1-community',
      '/forum/4-general',
      '/forum/9-off-topic',
    ])
  })

  it('appends an unlinked leaf for a thread', () => {
    const trail = buildBreadcrumb({
      forums: FORUMS,
      forumId: 4,
      leaf: 'What are you reading?',
    })
    expect(labels(trail)).toEqual(['Forums', 'Community', 'General', 'What are you reading?'])
    expect(trail[trail.length - 1]?.href).toBe('')
  })

  it('drops an ancestor the viewer cannot see', () => {
    const trail = buildBreadcrumb({
      forums: FORUMS,
      forumId: 7,
      visibleForumIds: new Set([7]),
    })
    expect(labels(trail)).toEqual(['Forums', 'Staff room'])
  })

  it('names no forum at all when the whole chain is hidden', () => {
    const trail = buildBreadcrumb({
      forums: FORUMS,
      forumId: 9,
      visibleForumIds: new Set([9]),
    })
    expect(labels(trail)).toEqual(['Forums', 'Off topic'])
  })

  it('shows every ancestor when no visibility set is given', () => {
    expect(labels(buildBreadcrumb({ forums: FORUMS, forumId: 7 }))).toEqual([
      'Forums',
      'Staff',
      'Staff room',
    ])
  })

  it('degrades to the root for a forum it cannot find', () => {
    expect(labels(buildBreadcrumb({ forums: FORUMS, forumId: 404 }))).toEqual(['Forums'])
    expect(labels(buildBreadcrumb({ forums: FORUMS, forumId: 404, leaf: 'Reply' }))).toEqual([
      'Forums',
      'Reply',
    ])
  })

  it('keeps every href unique, because themes key on it', () => {
    const trail = buildBreadcrumb({ forums: FORUMS, forumId: 9, leaf: 'A thread' })
    expect(new Set(trail.map((item) => item.href)).size).toBe(trail.length)
  })

  it('lets the caller rename the root', () => {
    const trail = buildBreadcrumb({ forums: FORUMS, forumId: 1, homeLabel: 'Board' })
    expect(labels(trail)).toEqual(['Board', 'Community'])
  })
})
