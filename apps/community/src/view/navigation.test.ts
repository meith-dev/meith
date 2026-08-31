import { describe, expect, it } from 'vitest'

import type { Actor } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'
import type { NavigationItemRow } from '@meith/db'
import { createTranslator, EN_CATALOG } from '@meith/i18n'

import {
  buildNavigation,
  builtInNavigation,
  defaultNavigationItems,
  NAVIGATION_AUDIENCE_VALUES,
  navigationLabel,
  outlineOf,
} from './navigation'
import { buildViewerModel } from './shell'

const guest: Actor = {
  userId: null,
  groupIds: [1],
  primaryGroupId: 1,
  state: 'guest',
  global: emptyPermissionSet(),
  permissionVersion: 1,
}

const member: Actor = { ...guest, userId: 42, groupIds: [2], primaryGroupId: 2, state: 'active' }

const MEMBER = buildViewerModel(member)
const GUEST = buildViewerModel(guest)
const STAFF = buildViewerModel(member, { canAccessModCp: true })

const english = createTranslator({ locale: 'en', catalog: EN_CATALOG })

function item(over: Partial<NavigationItemRow> = {}): NavigationItemRow {
  return {
    id: 1,
    key: null,
    parentId: null,
    label: 'Chat',
    href: 'https://chat.example.test',
    displayOrder: 100,
    audience: 'all',
    newTab: false,
    enabled: true,
    visibleToGroups: [],
    ...over,
  }
}

describe('navigationLabel', () => {
  it('translates a built-in item that has been given no label of its own', () => {
    expect(navigationLabel({ key: 'home', label: '' }, english)).toBe('Home')
  })

  it('prefers the label an administrator typed', () => {
    expect(navigationLabel({ key: 'home', label: 'Front page' }, english)).toBe('Front page')
  })

  it('uses the plugin’s own name for a row the board holds for it', () => {
    expect(
      navigationLabel({ key: 'plugin.dues.plans', label: '' }, english, {
        'plugin.dues.plans': { label: 'Supporters', labelKey: null },
      }),
    ).toBe('Supporters')
  })

  it('still prefers what an administrator typed over the plugin’s name', () => {
    expect(
      navigationLabel({ key: 'plugin.dues.plans', label: 'Join us' }, english, {
        'plugin.dues.plans': { label: 'Supporters', labelKey: null },
      }),
    ).toBe('Join us')
  })

  it('translates a plugin item whose message the board knows', () => {
    expect(
      navigationLabel({ key: 'plugin.dues.plans', label: '' }, english, {
        'plugin.dues.plans': { label: 'fallback', labelKey: 'nav.home' },
      }),
    ).toBe('Home')
  })

  it('falls back to the plugin’s text when its message is not translated here', () => {
    expect(
      navigationLabel({ key: 'plugin.dues.plans', label: '' }, english, {
        'plugin.dues.plans': { label: 'Supporters', labelKey: 'dues.nothing.here' },
      }),
    ).toBe('Supporters')
  })

  it('shows nothing for a plugin row whose plugin is no longer in the build', () => {
    expect(navigationLabel({ key: 'plugin.gone.item', label: '' }, english)).toBe('')
  })

  it('has nothing to show for a custom item with no label', () => {
    expect(navigationLabel({ key: null, label: '' }, english)).toBe('')
  })
})

describe('buildNavigation', () => {
  it('drops an item that is switched off', () => {
    const links = buildNavigation([item({ enabled: false })], MEMBER)

    expect(links).toEqual([])
  })

  it('carries newTab through for an off-site link and omits it otherwise', () => {
    const [offSite] = buildNavigation([item({ newTab: true })], MEMBER)
    const [onSite] = buildNavigation([item({ newTab: false })], MEMBER)

    expect(offSite?.newTab).toBe(true)
    expect(onSite).not.toHaveProperty('newTab')
  })

  it('shows a members-only item to a member and not to a guest', () => {
    const items = [item({ audience: 'members' })]

    expect(buildNavigation(items, MEMBER)).toHaveLength(1)
    expect(buildNavigation(items, GUEST)).toHaveLength(0)
  })

  it('shows a guests-only item to a guest and not to a member', () => {
    const items = [item({ audience: 'guests' })]

    expect(buildNavigation(items, GUEST)).toHaveLength(1)
    expect(buildNavigation(items, MEMBER)).toHaveLength(0)
  })

  it('shows a staff item only to somebody with a control panel', () => {
    const items = [item({ audience: 'staff' })]

    expect(buildNavigation(items, STAFF)).toHaveLength(1)
    expect(buildNavigation(items, MEMBER)).toHaveLength(0)
  })

  it('asks the caller about groups rather than reading the actor itself', () => {
    const items = [item({ visibleToGroups: [7] })]

    expect(buildNavigation(items, MEMBER, { admits: () => false })).toHaveLength(0)
    expect(buildNavigation(items, MEMBER, { admits: () => true })).toHaveLength(1)
  })

  it('drops the search item when the board has search switched off', () => {
    const items = defaultNavigationItems()

    const hrefs = buildNavigation(items, MEMBER, { searchEnabled: false }).map((link) => link.href)

    expect(hrefs).not.toContain('/search')
  })

  it('keeps a custom item pointing at the search page when search is off', () => {
    const items = [item({ href: '/search' })]

    expect(buildNavigation(items, MEMBER, { searchEnabled: false })).toHaveLength(1)
  })

  it('renders items in the order they arrive', () => {
    const links = buildNavigation(
      [item({ id: 1, label: 'One' }), item({ id: 2, label: 'Two' })],
      MEMBER,
    )

    expect(links.map((link) => link.label)).toEqual(['One', 'Two'])
  })

  it('leaves out an item that would render with no words in it', () => {
    expect(buildNavigation([item({ key: null, label: '' })], MEMBER)).toEqual([])
  })
})

describe('submenus', () => {
  it('hangs a child off its parent rather than listing it beside it', () => {
    const links = buildNavigation(
      [
        item({ id: 1, label: 'Community' }),
        item({ id: 2, parentId: 1, label: 'Discord', displayOrder: 1 }),
        item({ id: 3, parentId: 1, label: 'Wiki', displayOrder: 2 }),
      ],
      MEMBER,
    )

    expect(links).toHaveLength(1)
    expect(links[0]?.submenu?.map((link) => link.label)).toEqual(['Discord', 'Wiki'])
  })

  it('orders a submenu by display order, not by id', () => {
    const links = buildNavigation(
      [
        item({ id: 1, label: 'Community' }),
        item({ id: 2, parentId: 1, label: 'Second', displayOrder: 2 }),
        item({ id: 3, parentId: 1, label: 'First', displayOrder: 1 }),
      ],
      MEMBER,
    )

    expect(links[0]?.submenu?.map((link) => link.label)).toEqual(['First', 'Second'])
  })

  it('leaves submenu off an item that has no children a viewer may see', () => {
    const links = buildNavigation(
      [
        item({ id: 1, label: 'Community' }),
        item({ id: 2, parentId: 1, label: 'Staff room', audience: 'staff' }),
      ],
      MEMBER,
    )

    expect(links[0]).not.toHaveProperty('submenu')
  })

  it('takes the children with it when the parent is hidden', () => {
    const links = buildNavigation(
      [
        item({ id: 1, label: 'Community', enabled: false }),
        item({ id: 2, parentId: 1, label: 'Discord' }),
      ],
      MEMBER,
    )

    expect(links).toEqual([])
  })
})

describe('outlineOf', () => {
  it('puts each child directly under its parent, at depth one', () => {
    const outline = outlineOf([
      item({ id: 1, label: 'One', displayOrder: 0 }),
      item({ id: 2, label: 'Two', displayOrder: 10 }),
      item({ id: 3, parentId: 1, label: 'Child', displayOrder: 0 }),
    ])

    expect(outline.map((row) => [row.id, row.depth])).toEqual([
      [1, 0],
      [3, 1],
      [2, 0],
    ])
  })
})

describe('the built-in menu', () => {
  it('names a built-in by key and nothing by a key it does not know', () => {
    expect(builtInNavigation('home')?.href).toBe('/')
    expect(builtInNavigation('made-up')).toBeNull()
    expect(builtInNavigation(null)).toBeNull()
  })

  it('offers every audience the database accepts', () => {
    expect([...NAVIGATION_AUDIENCE_VALUES]).toEqual(['all', 'guests', 'members', 'staff'])
  })

  it('starts a board off with the same menu the seed writes', () => {
    expect(defaultNavigationItems().map((row) => row.key)).toEqual([
      'home',
      'new-posts',
      'unanswered',
      'my-posts',
      'search',
      'online',
      'members',
      'staff',
    ])
  })
})
