import { describe, expect, it } from 'vitest'

import {
  type PanelNav,
  type PanelSection,
  countFor,
  deepestHrefIn,
  isUnder,
  sectionHrefIn,
  visibleChildren,
} from './panel-nav'

/**
 * The matching itself, away from any one panel's tree.
 *
 * `admin-nav.test.ts`, `usercp-nav.test.ts` and `modcp-nav.test.ts` each check
 * that *their* addresses light *their* items. What is here is the two pieces
 * all three depend on and none of them owns: which sub-pages a rail may draw,
 * and what a count of nothing renders as.
 */

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
    /* The reason it is not `startsWith`: a future `/panel/things-archive`. */
    expect(isUnder('/panel/things-archive', '/panel/things')).toBe(false)
    expect(isUnder('/panel/things/12', '/panel/things')).toBe(true)
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
    /*
     * A record has no bare address worth linking — it is a row you opened —
     * so offering one from the section's own screen would be a link to a 404.
     */
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
