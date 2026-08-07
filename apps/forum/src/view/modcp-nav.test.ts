import { describe, expect, it } from 'vitest'

import { flattenNav, isUnder, visibleChildren } from './panel-nav'
import {
  MODCP_OVERVIEW,
  activeSectionHref,
  currentProps,
  deepestNavHref,
  modCpNav,
  modCpSections,
} from './modcp-nav'

/**
 * The moderator panel's rail is the one that straddles two route trees, and its
 * tree is the one that varies by who is looking. Both are cases the other two
 * panels do not have, and both are the kind of thing that looks right the day
 * it is written and is quietly wrong two routes later.
 *
 * The case worth the most attention is `/moderation/warn`. It is under
 * `/moderation`, so a naive longest-prefix match hands it to the approval
 * queue and the rail says "Approval queue, current" while a moderator is
 * writing a warning about somebody. It is in the tree as a `record` precisely
 * so that does not happen.
 */

const FULL = { canWarn: true, canLookUpIp: true }
const PLAIN = { canWarn: false, canLookUpIp: false }

const current = (access: typeof FULL, pathname: string, href: string) =>
  currentProps(pathname, href, deepestNavHref(access, pathname))['aria-current']

describe('modCpSections', () => {
  it('offers the address lookup only to somebody who may use it', () => {
    expect(modCpSections(FULL).some((s) => s.href === '/modcp/ip')).toBe(true)
    expect(modCpSections(PLAIN).some((s) => s.href === '/modcp/ip')).toBe(false)
  })

  it('offers the warn screen only to somebody who holds the permission', () => {
    const withWarn = modCpSections(FULL).find((s) => s.href === '/moderation')
    const without = modCpSections(PLAIN).find((s) => s.href === '/moderation')
    expect(withWarn?.children?.map((c) => c.href)).toEqual(['/moderation/warn'])
    expect(without?.children).toEqual([])
  })

  it('gives every section a sentence, because the index prints one', () => {
    for (const section of modCpNav(FULL)) expect(section.blurb.length).toBeGreaterThan(0)
  })
})

describe('activeSectionHref', () => {
  it('picks the section, not the panel that contains it', () => {
    expect(activeSectionHref(FULL, '/modcp/forums')).toBe('/modcp/forums')
    expect(activeSectionHref(FULL, '/modcp/log')).toBe('/modcp/log')
  })

  it('does not let the queue swallow reports, which sit under it', () => {
    /* `/moderation` is a prefix of `/moderation/reports`; longest match wins. */
    expect(activeSectionHref(FULL, '/moderation/reports')).toBe('/moderation/reports')
  })

  it('is the overview only on the overview', () => {
    expect(activeSectionHref(FULL, '/modcp')).toBe('/modcp')
  })

  it('answers null outside the panel', () => {
    /* The rail renders on two route trees; everywhere else it lights nothing. */
    expect(activeSectionHref(FULL, '/thread/22-hello')).toBeNull()
    expect(activeSectionHref(FULL, '/admin/settings')).toBeNull()
  })

  it('falls back to the overview for a section this moderator does not have', () => {
    /*
     * `/modcp` is a prefix of `/modcp/ip`, so an address whose own section has
     * been filtered out of the tree lands on the overview rather than on
     * nothing. It is moot in practice — the page itself 404s for them, so the
     * rail is never drawn — but "the nearest thing I do have" is the right
     * answer for it either way.
     */
    expect(activeSectionHref(PLAIN, '/modcp/ip')).toBe('/modcp')
  })

  it('does not let the overview swallow the sections under it', () => {
    expect(activeSectionHref(FULL, '/modcp/log')).toBe('/modcp/log')
  })
})

describe('deepestNavHref', () => {
  it('prefers the warn record over the queue that is its prefix', () => {
    expect(deepestNavHref(FULL, '/moderation/warn')).toBe('/moderation/warn')
  })

  it('falls back to the queue when the moderator has no warn screen', () => {
    /*
     * The honest second-best: they cannot reach the screen, so the rail has
     * nothing better to say than which section the address is inside.
     */
    expect(deepestNavHref(PLAIN, '/moderation/warn')).toBe('/moderation')
  })
})

describe('currentProps', () => {
  it('marks the screen you are on', () => {
    expect(current(FULL, '/modcp/forums', '/modcp/forums')).toBe('page')
  })

  it('announces the warn screen rather than the queue above it', () => {
    expect(current(FULL, '/moderation/warn', '/moderation/warn')).toBe('page')
    expect(current(FULL, '/moderation/warn', '/moderation')).toBeUndefined()
  })

  it('marks nothing at all off the panel', () => {
    for (const section of modCpNav(FULL)) {
      expect(current(FULL, '/thread/22-hello', section.href)).toBeUndefined()
    }
  })
})

describe('visibleChildren', () => {
  const queue = modCpSections(FULL).find((s) => s.href === '/moderation')

  it('hides a record until you are on it', () => {
    /* Otherwise the queue's own screen would offer a link that 404s bare. */
    expect(visibleChildren(queue!, '/moderation')).toEqual([])
  })

  it('shows the record while you are on it', () => {
    expect(visibleChildren(queue!, '/moderation/warn').map((c) => c.href)).toEqual([
      '/moderation/warn',
    ])
  })
})

describe('the tree itself', () => {
  it('starts at the overview and never lists it twice', () => {
    expect(modCpNav(FULL)[0]).toBe(MODCP_OVERVIEW)
    expect(modCpSections(FULL).some((s) => s.href === MODCP_OVERVIEW.href)).toBe(false)
  })

  it('has no duplicate addresses', () => {
    const hrefs = flattenNav(modCpNav(FULL)).map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('nests every sub-page under the section it claims to be in', () => {
    for (const section of modCpNav(FULL)) {
      for (const child of section.children ?? []) {
        expect(isUnder(child.href, section.href)).toBe(true)
      }
    }
  })
})
