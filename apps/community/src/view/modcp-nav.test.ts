import { describe, expect, it } from 'vitest'

import { EN_CATALOG } from '@meith/i18n'

import {
  activeSectionHref,
  currentProps,
  deepestNavHref,
  MODCP_OVERVIEW,
  modCpNav,
  modCpNavWithPlugin,
  modCpSections,
  pluginKeyAtModCp,
} from './modcp-nav'
import { flattenNav, isUnder, visibleChildren } from './panel-nav'

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
    for (const section of modCpNav(FULL)) {
      expect(EN_CATALOG[section.blurbKey!]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('activeSectionHref', () => {
  it('picks the section, not the panel that contains it', () => {
    expect(activeSectionHref(FULL, '/modcp/forums')).toBe('/modcp/forums')
    expect(activeSectionHref(FULL, '/modcp/log')).toBe('/modcp/log')
  })

  it('does not let the queue swallow reports, which sit under it', () => {
    expect(activeSectionHref(FULL, '/moderation/reports')).toBe('/moderation/reports')
  })

  it('is the overview only on the overview', () => {
    expect(activeSectionHref(FULL, '/modcp')).toBe('/modcp')
  })

  it('answers null outside the panel', () => {
    expect(activeSectionHref(FULL, '/thread/22-hello')).toBeNull()
    expect(activeSectionHref(FULL, '/admin/settings')).toBeNull()
  })

  it('falls back to the overview for a section this moderator does not have', () => {
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

describe('pluginKeyAtModCp', () => {
  it('reads the plugin key out of a modcp plugin path', () => {
    expect(pluginKeyAtModCp('/modcp/plugins/dues')).toBe('dues')
    expect(pluginKeyAtModCp('/modcp/plugins/dues/triage')).toBe('dues')
    expect(pluginKeyAtModCp('/modcp/plugins/dues?tab=open')).toBe('dues')
  })

  it('is null anywhere but the modcp plugin mount', () => {
    expect(pluginKeyAtModCp('/modcp')).toBeNull()
    expect(pluginKeyAtModCp('/modcp/forums')).toBeNull()
    expect(pluginKeyAtModCp('/admin/plugins/dues')).toBeNull()
  })
})

describe('modCpNavWithPlugin', () => {
  const section = {
    key: 'dues',
    name: 'Dues',
    pages: [
      { href: '/modcp/plugins/dues/triage', titleText: 'Triage' },
      { href: '/modcp/plugins/dues/audit', titleText: 'Audit' },
    ],
  }

  it('gives the plugin its own rail section under the panel, headed by its mount', () => {
    const added = modCpNavWithPlugin(FULL, section).find((s) => s.href === '/modcp/plugins/dues')
    expect(added?.titleText).toBe('Dues')
    expect(added?.children?.map((c) => c.href)).toEqual([
      '/modcp/plugins/dues/triage',
      '/modcp/plugins/dues/audit',
    ])
  })

  it('does not repeat a staff index page — the header already reaches it', () => {
    const withIndex = {
      key: 'dues',
      name: 'Dues',
      pages: [
        { href: '/modcp/plugins/dues', titleText: 'Overview' },
        { href: '/modcp/plugins/dues/triage', titleText: 'Triage' },
      ],
    }
    const added = modCpNavWithPlugin(FULL, withIndex).find((s) => s.href === '/modcp/plugins/dues')
    expect(added?.children?.map((c) => c.href)).toEqual(['/modcp/plugins/dues/triage'])
  })

  it('nests every plugin page under the section header, so the rail opens on it', () => {
    const added = modCpNavWithPlugin(FULL, section).find((s) => s.href === '/modcp/plugins/dues')!
    for (const child of added.children ?? []) {
      expect(isUnder(child.href, added.href)).toBe(true)
    }
  })

  it('is the plain nav when there is no plugin or it declares no staff pages', () => {
    expect(modCpNavWithPlugin(FULL, null)).toEqual(modCpNav(FULL))
    expect(modCpNavWithPlugin(FULL, { key: 'dues', name: 'Dues', pages: [] })).toEqual(
      modCpNav(FULL),
    )
  })

  it('adds no duplicate address when the plugin section joins', () => {
    const hrefs = flattenNav(modCpNavWithPlugin(FULL, section)).map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
