import { describe, expect, it } from 'vitest'

import { buildForumJumpModel, parseJumpTarget, type ForumJumpRow } from './forum-jump'

/**
 * F27 — the jump box's view model.
 *
 * Most of this file is about the **leak**, because that is the interesting risk
 * in a control that lists every forum on the board and appears on every page.
 * The ordinary cases are here too, but a jump box that renders beautifully and
 * names a hidden category has failed at the only thing that is hard about it.
 */

const row = (
  id: number,
  parentId: number | null,
  title: string,
  type = 'forum',
): ForumJumpRow => ({ id, parentId, displayOrder: id, type, title, slug: `f${id}` })

/*
 *   1 General (category)
 *     2 Announcements
 *     3 Chat
 *       4 Off topic
 *   5 Staff (category)
 *     6 Staff room
 */
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

  /*
   * Categories are listed and marked, not dropped. Dropping them would leave
   * the indentation meaningless — a forum two levels deep with no visible
   * ancestor reads as top-level — and MyBB lists them too.
   */
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
  /*
   * The one that matters. `buildTree` promotes an orphan to a root, so filtering
   * row-by-row would surface a hidden category's children at the top level —
   * announcing that they exist, what they are called, and making the board's
   * shape depend on who is looking.
   *
   * On a jump box this is worse than on the index, because the box is on *every*
   * page, including ones a member reached without going through the index.
   */
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

  /* And to a fixed point: a grandchild whose parent went for this reason. */
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
  /*
   * The app owns the URL and the parameter name. A theme typing `name="forum"`
   * hardcodes the app's query-string contract into markup the app does not own,
   * and renaming the parameter would break every installed theme's box while
   * the page kept rendering.
   */
  it('supplies the action and the field name', () => {
    const model = build(all)
    expect(model.action).toBe('/jump')
    expect(model.field).toBe('forum')
  })

  /*
   * A submit label is always present, because the button is always present.
   * A jump box that navigates on `change` teleports a keyboard user to the
   * first option as they arrow through the list, and does nothing at all
   * without JavaScript.
   */
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

/**
 * What the page does with what the box submitted.
 *
 * The page itself cannot be unit-tested — every branch ends in `redirect` or
 * `notFound`, both of which throw — so the decision it makes lives here.
 */
describe('parseJumpTarget', () => {
  it('reads a submitted id', () => {
    expect(parseJumpTarget('42')).toBe(42)
  })

  /*
   * Nothing chosen is the index, not an error. This is what "Go" does when
   * somebody presses it without touching the select.
   */
  it('treats an absent selection as no selection', () => {
    expect(parseJumpTarget(undefined)).toBeNull()
    expect(parseJumpTarget('')).toBeNull()
  })

  /*
   * Anything that is not digits is a typed URL rather than a submission, and it
   * goes to the index for the same reason: the alternative distinguishes
   * malformed from unauthorised, which is half an oracle.
   */
  it('refuses anything that is not a plain id', () => {
    for (const raw of ['-1', '1.5', '1e3', ' 1', '1 ', 'four', '0x2a', '٤٢']) {
      expect(parseJumpTarget(raw)).toBeNull()
    }
  })

  /*
   * `?forum=3&forum=9` reaches a page as an array where it reached the old
   * route handler as `URLSearchParams.get` — first value. Same answer, now on
   * purpose.
   */
  it('takes the first value when the parameter is repeated', () => {
    expect(parseJumpTarget(['3', '9'])).toBe(3)
    expect(parseJumpTarget([])).toBeNull()
    expect(parseJumpTarget(['nope', '9'])).toBeNull()
  })

  /*
   * Zero is not a forum id, but it is digits — so it parses, and the
   * authorisation check is what rejects it. Recorded because a reader can
   * reasonably expect this function to have refused it.
   */
  it('leaves ids that parse but cannot exist to the permission check', () => {
    expect(parseJumpTarget('0')).toBe(0)
  })
})
