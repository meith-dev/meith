import { describe, expect, it } from 'vitest'

import { buildForumJumpModel, parseJumpTarget, type ForumJumpRow } from './forum-jump'

const row = (
  id: number,
  parentId: number | null,
  title: string,
  type = 'forum',
): ForumJumpRow => ({ id, parentId, displayOrder: id, type, title, slug: `f${id}` })

const TREE: ForumJumpRow[] = [
  row(1, null, 'General', 'category'),
  row(2, 1, 'Announcements'),
  row(3, 1, 'Chat'),
  row(4, 3, 'Off topic'),
  row(5, null, 'Staff', 'category'),
  row(6, 5, 'Staff room'),
]

const all = new Set([1, 2, 3, 4, 5, 6])
const build = (visible: ReadonlySet<number>, currentForumId: number | null = null) =>
  buildForumJumpModel({ rows: TREE, visibleForumIds: visible, currentForumId })

describe('what it lists', () => {
  it('lists every visible forum in tree order', () => {
    expect(build(all).forums.map((f) => f.label)).toEqual([
      'General',
      'Announcements',
      'Chat',
      'Off topic',
      'Staff',
      'Staff room',
    ])
  })

  it('reports depth so the theme can indent', () => {
    expect(build(all).forums.map((f) => f.depth)).toEqual([0, 1, 1, 2, 0, 1])
  })

  it('marks categories rather than omitting them', () => {
    const categories = build(all).forums.filter((f) => f.isCategory)
    expect(categories.map((f) => f.label)).toEqual(['General', 'Staff'])
  })

  it('pre-selects the forum being viewed', () => {
    const selected = build(all, 3).forums.filter((f) => f.isSelected)
    expect(selected.map((f) => f.label)).toEqual(['Chat'])
  })

  it('selects nothing off a forum page', () => {
    expect(build(all, null).forums.some((f) => f.isSelected)).toBe(false)
  })
})

describe('what it must never leak', () => {
  it('drops a whole subtree when its category is hidden', () => {
    const model = build(new Set([1, 2, 3, 4, 6]))

    expect(model.forums.map((f) => f.label)).toEqual([
      'General',
      'Announcements',
      'Chat',
      'Off topic',
    ])
    expect(model.forums.map((f) => f.label)).not.toContain('Staff room')
  })

  it('drops a grandchild whose parent was dropped as an orphan', () => {
    const model = build(new Set([1, 2, 4]))

    expect(model.forums.map((f) => f.label)).toEqual(['General', 'Announcements'])
    expect(model.forums.map((f) => f.label)).not.toContain('Off topic')
  })

  it('lists nothing at all when nothing is visible', () => {
    expect(build(new Set()).forums).toEqual([])
  })
})

describe('the contract with the theme', () => {
  it('supplies the action and the field name', () => {
    const model = build(all)
    expect(model.action).toBe('/jump')
    expect(model.field).toBe('forum')
  })

  it('always supplies a submit label and an accessible name', () => {
    const model = build(all)
    expect(model.submitLabel).not.toBe('')
    expect(model.label).not.toBe('')
  })

  it('sends opaque string values, not hrefs the theme would have to parse', () => {
    for (const forum of build(all).forums) {
      expect(forum.value).toMatch(/^\d+$/)
    }
  })
})

describe('parseJumpTarget', () => {
  it('reads a submitted id', () => {
    expect(parseJumpTarget('42')).toBe(42)
  })

  it('treats an absent selection as no selection', () => {
    expect(parseJumpTarget(undefined)).toBeNull()
    expect(parseJumpTarget('')).toBeNull()
  })

  it('refuses anything that is not a plain id', () => {
    for (const raw of ['-1', '1.5', '1e3', ' 1', '1 ', 'four', '0x2a', '٤٢']) {
      expect(parseJumpTarget(raw)).toBeNull()
    }
  })

  it('takes the first value when the parameter is repeated', () => {
    expect(parseJumpTarget(['3', '9'])).toBe(3)
    expect(parseJumpTarget([])).toBeNull()
    expect(parseJumpTarget(['nope', '9'])).toBeNull()
  })

  it('leaves ids that parse but cannot exist to the permission check', () => {
    expect(parseJumpTarget('0')).toBe(0)
  })
})
