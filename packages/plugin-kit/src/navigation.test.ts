import { describe, expect, it } from 'vitest'

import { pluginKeyOfNavigation, pluginNavigationPlacements } from './navigation'
import { definePlugin, pluginNavigationKey } from './plugin'

const page = { path: '', title: 'Plans', access: 'anonymous' as const, render: () => null }
const managePage = { ...page, path: 'manage', title: 'Manage', access: 'member' as const }

function dues(navigation: Parameters<typeof definePlugin>[0]['navigation']) {
  return definePlugin({
    key: 'dues',
    name: 'Dues',
    version: '1.0.0',
    apiVersion: '0',
    pages: [page, managePage],
    navigation,
  })
}

describe('declaring navigation', () => {
  it('refuses an item pointing at a page the plugin does not have', () => {
    expect(() => dues([{ key: 'ghost', label: 'Ghost', path: 'ghost' }])).toThrow(
      /does not declare/,
    )
  })

  it('refuses an item with no label, because that is what it is called until renamed', () => {
    expect(() => dues([{ key: 'plans', label: '  ', path: '' }])).toThrow(/needs a label/)
  })

  it('refuses two items under one key', () => {
    expect(() =>
      dues([
        { key: 'plans', label: 'A', path: '' },
        { key: 'plans', label: 'B', path: 'manage' },
      ]),
    ).toThrow(/navigation item/)
  })

  it('refuses an audience the navigation has no meaning for', () => {
    expect(() =>
      // @ts-expect-error the point of the test is the value the types already refuse
      dues([{ key: 'plans', label: 'Plans', path: '', audience: 'admins' }]),
    ).toThrow(/audience must be/)
  })

  it('accepts an item pointing at the plugin’s index page', () => {
    expect(() => dues([{ key: 'plans', label: 'Plans', path: '' }])).not.toThrow()
  })
})

describe('pluginNavigationPlacements', () => {
  it('namespaces the key and resolves the path to the plugin’s own page', () => {
    const placements = pluginNavigationPlacements([
      dues([
        { key: 'plans', label: 'Plans', path: '' },
        { key: 'manage', label: 'Manage', path: 'manage', audience: 'members' },
      ]),
    ])

    expect(placements).toEqual([
      {
        key: 'plugin.dues.plans',
        href: '/plugins/dues',
        audience: 'all',
        label: 'Plans',
        labelKey: null,
        labelArgs: null,
      },
      {
        key: 'plugin.dues.manage',
        href: '/plugins/dues/manage',
        audience: 'members',
        label: 'Manage',
        labelKey: null,
        labelArgs: null,
      },
    ])
  })

  it('has nothing to place for a plugin that asked for nothing', () => {
    expect(pluginNavigationPlacements([dues(undefined)])).toEqual([])
  })
})

describe('reading a key back', () => {
  it('recovers the plugin a row belongs to', () => {
    expect(pluginKeyOfNavigation(pluginNavigationKey('dues', 'plans'))).toBe('dues')
  })

  it('says nothing for the board’s own rows', () => {
    expect(pluginKeyOfNavigation('home')).toBeNull()
    expect(pluginKeyOfNavigation(null)).toBeNull()
  })
})
