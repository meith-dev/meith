import { describe, expect, it } from 'vitest'

import {
  ADMIN_NAV,
  ADMIN_OVERVIEW,
  ADMIN_SECTIONS,
  activeSectionHref,
  currentProps,
  deepestNavHref,
  isUnder,
} from './admin-nav'

const current = (pathname: string, href: string) =>
  currentProps(pathname, href, deepestNavHref(pathname))['aria-current']

describe('isUnder', () => {
  it('matches the page itself and anything below it', () => {
    expect(isUnder('/admin/users', '/admin/users')).toBe(true)
    expect(isUnder('/admin/users/12', '/admin/users')).toBe(true)
  })

  it('needs a segment boundary', () => {
    expect(isUnder('/admin/users-online', '/admin/users')).toBe(false)
    expect(isUnder('/admin/use', '/admin/users')).toBe(false)
  })
})

describe('activeSectionHref', () => {
  it('picks the section, not the panel that contains it', () => {
    expect(activeSectionHref('/admin/settings')).toBe('/admin/settings')
    expect(activeSectionHref('/admin/forums/12/permissions')).toBe('/admin/forums')
  })

  it('keeps the section lit while you are inside one of its screens', () => {
    expect(activeSectionHref('/admin/users/mail')).toBe('/admin/users')
    expect(activeSectionHref('/admin/users/12/merge')).toBe('/admin/users')
  })

  it('falls back to the overview, including for addresses it has not heard of', () => {
    expect(activeSectionHref('/admin')).toBe('/admin')
    expect(activeSectionHref('/admin/something-a-plugin-added')).toBe('/admin')
  })
})

describe('deepestNavHref', () => {
  it('prefers a sub-page over its section', () => {
    expect(deepestNavHref('/admin/users/mail')).toBe('/admin/users/mail')
    expect(deepestNavHref('/admin/content/attachments')).toBe('/admin/content/attachments')
  })

  it('stops at the section for a record inside it', () => {
    expect(deepestNavHref('/admin/users/12')).toBe('/admin/users')
  })
})

describe('currentProps', () => {
  it('marks the page you are on', () => {
    expect(current('/admin/settings', '/admin/settings')).toBe('page')
    expect(current('/admin', '/admin')).toBe('page')
  })

  it('announces a section once, not twice', () => {
    expect(current('/admin/users/mail', '/admin/users/mail')).toBe('page')
    expect(current('/admin/users/mail', '/admin/users')).toBeUndefined()
  })

  it('falls back to the section for a screen with no link of its own', () => {
    expect(current('/admin/users/12', '/admin/users')).toBe('true')
  })

  it('leaves everything else alone', () => {
    expect(current('/admin/settings', '/admin/forums')).toBeUndefined()
    expect(current('/admin/settings', '/admin')).toBeUndefined()
  })
})

describe('the tree itself', () => {
  it('starts at the overview and never lists it twice', () => {
    expect(ADMIN_NAV[0]).toBe(ADMIN_OVERVIEW)
    expect(ADMIN_SECTIONS.some((section) => section.href === ADMIN_OVERVIEW.href)).toBe(false)
  })

  it('has no duplicate addresses', () => {
    const hrefs = ADMIN_NAV.flatMap((section) => [
      section.href,
      ...(section.children ?? []).map((child) => child.href),
    ])
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('nests every sub-page under the section it claims to be in', () => {
    for (const section of ADMIN_NAV) {
      for (const child of section.children ?? []) {
        expect(isUnder(child.href, section.href)).toBe(true)
      }
    }
  })
})
