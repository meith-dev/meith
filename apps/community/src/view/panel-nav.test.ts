import { describe, expect, it } from 'vitest'

import {
  type PanelNav,
  type PanelSection,
  buildPanelNavModel,
  countFor,
  deepestHrefIn,
  isHere,
  isUnder,
  sectionHrefIn,
  visibleChildren,
} from './panel-nav'

const SECTION: PanelSection = {
  href: '/panel/things',
  title: 'Things',
  blurb: 'Some things.',
  children: [
    { href: '/panel/things/new', title: 'New thing' },
    { href: '/panel/things/edit', title: 'One thing', record: true },
  ],
}

const NAV: PanelNav = [
  { href: '/panel', title: 'Overview', blurb: 'The front door.' },
  SECTION,
]

describe('isUnder', () => {
  it('needs a segment boundary', () => {
    expect(isUnder('/panel/things-archive', '/panel/things')).toBe(false)
    expect(isUnder('/panel/things/12', '/panel/things')).toBe(true)
  })

  it('ignores a query the item does not name', () => {
    expect(isUnder('/panel/things?group=b&sort=old', '/panel/things')).toBe(true)
  })

  it('holds an item to every parameter it does name', () => {
    expect(isUnder('/panel/things?group=b', '/panel/things?group=b')).toBe(true)
    expect(isUnder('/panel/things?group=c', '/panel/things?group=b')).toBe(false)
    expect(isUnder('/panel/things', '/panel/things?group=b')).toBe(false)
  })

  it('leaves the other filters on an address alone', () => {
    expect(isUnder('/panel/things?group=b&advanced=1', '/panel/things?group=b')).toBe(
      true,
    )
  })
})

describe('isHere', () => {
  it('is the address itself, not something inside it', () => {
    expect(isHere('/panel/things', '/panel/things')).toBe(true)
    expect(isHere('/panel/things/12', '/panel/things')).toBe(false)
  })

  it('reads a query the same way `isUnder` does', () => {
    expect(isHere('/panel/things?group=b&advanced=1', '/panel/things?group=b')).toBe(true)
    expect(isHere('/panel/things?group=c', '/panel/things?group=b')).toBe(false)
  })
})

describe('sectionHrefIn and deepestHrefIn', () => {
  it('sends a record to its section but names the record itself', () => {
    expect(sectionHrefIn(NAV, '/panel/things/edit')).toBe('/panel/things')
    expect(deepestHrefIn(NAV, '/panel/things/edit')).toBe('/panel/things/edit')
  })

  it('answers null off the tree, leaving the fallback to the caller', () => {
    expect(sectionHrefIn(NAV, '/somewhere')).toBeNull()
  })
})

describe('visibleChildren', () => {
  it('always draws an ordinary sub-page', () => {
    expect(visibleChildren(SECTION, '/panel/things').map((c) => c.href)).toEqual([
      '/panel/things/new',
    ])
  })

  it('draws a record only where you are standing on it', () => {
    expect(visibleChildren(SECTION, '/panel/things/edit').map((c) => c.href)).toEqual([
      '/panel/things/new',
      '/panel/things/edit',
    ])
  })

  it('draws nothing for a section with no sub-pages', () => {
    expect(visibleChildren(NAV[0] as PanelSection, '/panel')).toEqual([])
  })
})

describe('countFor', () => {
  it('is absent at nought, so an idle rail carries no badges', () => {
    expect(countFor({ '/panel/things': 0 }, '/panel/things')).toBeNull()
    expect(countFor(undefined, '/panel/things')).toBeNull()
    expect(countFor({}, '/panel/things')).toBeNull()
  })

  it('is the number when there is one', () => {
    expect(countFor({ '/panel/things': 4 }, '/panel/things')).toBe(4)
  })
})

describe('buildPanelNavModel', () => {
  const build = (location: string, counts?: Record<string, number>) =>
    buildPanelNavModel({
      panel: 'usercp',
      nav: NAV,
      overviewHref: '/panel',
      location,
      ...(counts === undefined ? {} : { counts }),
    })

  it('marks the page the reader is on, and only that one', () => {
    const model = build('/panel/things')

    expect(model.sections.map((s) => s.current)).toEqual([null, 'here'])
  })

  it('marks a page inside a section as under it, not as it', () => {
    const model = build('/panel/things/12')

    expect(model.sections[1]?.current).toBe('under')
    expect(model.sections[1]?.isOpen).toBe(true)
  })

  it('opens only the section the reader is in', () => {
    expect(build('/panel/things').sections.map((s) => s.isOpen)).toEqual([false, true])
  })

  it('lists a closed section’s children nowhere', () => {
    expect(build('/panel').sections[1]?.children).toEqual([])
  })

  it('lists an open section’s children, and the record only where it is', () => {
    expect(build('/panel/things').sections[1]?.children.map((c) => c.href)).toEqual([
      '/panel/things/new',
    ])

    expect(build('/panel/things/edit').sections[1]?.children.map((c) => c.href)).toEqual([
      '/panel/things/new',
      '/panel/things/edit',
    ])
  })

  it('says which child is a record, so a theme renders it as where you are', () => {
    const children = build('/panel/things/edit').sections[1]?.children ?? []

    expect(children.map((c) => c.isRecord)).toEqual([false, true])
    expect(children[1]?.current).toBe('here')
  })

  it('names the overview so a theme can set it apart', () => {
    expect(build('/panel').sections.map((s) => s.isOverview)).toEqual([true, false])
  })

  it('carries a waiting count, and nothing at nought', () => {
    const model = build('/panel', { '/panel/things': 4, '/panel': 0 })

    expect(model.sections.map((s) => s.count)).toEqual([null, 4])
  })

  it('names where the reader is, for a rail that is collapsed', () => {
    expect(build('/panel/things/edit').currentTitle).toBe('One thing')
    expect(build('/panel/things').currentTitle).toBe('Things')
  })

  it('marks nothing when the location is off the tree', () => {
    const model = build('/somewhere-else')

    expect(model.sections.every((s) => s.current === null && !s.isOpen)).toBe(true)
    expect(model.currentTitle).toBeNull()
  })

  it('falls back to a named item when nothing matched, for a panel with a front page', () => {
    const model = buildPanelNavModel({
      panel: 'admincp',
      nav: NAV,
      overviewHref: '/panel',
      location: '/somewhere-else',
      fallbackHref: '/panel',
    })

    expect(model.sections[0]?.current).toBe('under')
    expect(model.sections[0]?.isOpen).toBe(true)
  })
})
