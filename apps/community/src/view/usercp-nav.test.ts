import { describe, expect, it } from 'vitest'

import { flattenNav, isUnder } from './panel-nav'
import {
  USERCP_NAV,
  USERCP_OVERVIEW,
  USERCP_SECTIONS,
  activeSectionHref,
  currentPanelItem,
  currentProps,
  deepestNavHref,
} from './usercp-nav'

const current = (pathname: string, href: string) =>
  currentProps(pathname, href, deepestNavHref(pathname))['aria-current']

describe('activeSectionHref', () => {
  it('finds the section a screen belongs to', () => {
    expect(activeSectionHref('/usercp/profile')).toBe('/usercp/profile')
    expect(activeSectionHref('/messages/12')).toBe('/messages')
    expect(activeSectionHref('/notifications/preferences')).toBe('/notifications')
  })

  it('is the overview only on the overview', () => {
    expect(activeSectionHref('/usercp')).toBe('/usercp')
  })

  it('answers null outside the panel', () => {
    expect(activeSectionHref('/thread/22-hello')).toBeNull()
    expect(activeSectionHref('/admin/settings')).toBeNull()
  })

  it('does not let the overview swallow the other sections', () => {
    expect(activeSectionHref('/usercp/avatar')).toBe('/usercp/avatar')
  })
})

describe('deepestNavHref', () => {
  it('prefers a sub-page over its section', () => {
    expect(deepestNavHref('/notifications/preferences')).toBe('/notifications/preferences')
    expect(deepestNavHref('/messages/compose')).toBe('/messages/compose')
  })

  it('stops at the section for a record inside it', () => {
    expect(deepestNavHref('/messages/12')).toBe('/messages')
  })

  it('answers null outside the panel', () => {
    expect(deepestNavHref('/')).toBeNull()
  })
})

describe('currentProps', () => {
  it('marks the screen you are on', () => {
    expect(current('/usercp/signature', '/usercp/signature')).toBe('page')
  })

  it('announces a section once, not twice', () => {
    expect(current('/messages/compose', '/messages/compose')).toBe('page')
    expect(current('/messages/compose', '/messages')).toBeUndefined()
  })

  it('falls back to the section for a screen with no link of its own', () => {
    expect(current('/messages/12', '/messages')).toBe('true')
  })

  it('marks nothing at all off the panel', () => {
    for (const section of USERCP_NAV) {
      expect(current('/thread/22-hello', section.href)).toBeUndefined()
    }
  })
})

describe('currentPanelItem', () => {
  it('names the sub-page when you are on one', () => {
    expect(currentPanelItem('/notifications/preferences')?.title).toBe('Preferences')
  })

  it('names the section when you are inside a record', () => {
    expect(currentPanelItem('/messages/12')?.title).toBe('Private messages')
  })

  it('names nothing off the panel', () => {
    expect(currentPanelItem('/search')).toBeNull()
  })
})

describe('the tree itself', () => {
  it('starts at the overview and never lists it twice', () => {
    expect(USERCP_NAV[0]).toBe(USERCP_OVERVIEW)
    expect(USERCP_SECTIONS.some((section) => section.href === USERCP_OVERVIEW.href)).toBe(false)
  })

  it('has no duplicate addresses', () => {
    const hrefs = flattenNav(USERCP_NAV).map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('nests every sub-page under the section it claims to be in', () => {
    for (const section of USERCP_NAV) {
      for (const child of section.children ?? []) {
        expect(isUnder(child.href, section.href)).toBe(true)
      }
    }
  })

  it('gives every section a sentence, because the index prints one', () => {
    for (const section of USERCP_NAV) expect(section.blurb.length).toBeGreaterThan(0)
  })
})
