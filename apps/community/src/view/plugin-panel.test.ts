import { describe, expect, it } from 'vitest'

import {
  PLUGIN_SETTINGS_TAB,
  pluginNavChildren,
  pluginPanelTabs,
  pluginStaffPanelTabs,
} from './plugin-panel'

const PAGES = [
  { path: 'status', title: 'Status', href: '/admin/plugins/dues/status' },
  { path: 'plans', title: 'Plans', href: '/admin/plugins/dues/plans' },
]

describe('pluginPanelTabs', () => {
  it('puts the plugin’s own screen first, then every page it declares', () => {
    const tabs = pluginPanelTabs({ pluginKey: 'dues', pages: PAGES, current: null })

    expect(tabs.map((tab) => tab.label)).toEqual([PLUGIN_SETTINGS_TAB, 'Status', 'Plans'])
    expect(tabs.map((tab) => tab.href)).toEqual([
      '/admin/plugins/dues',
      '/admin/plugins/dues/status',
      '/admin/plugins/dues/plans',
    ])
  })

  it('marks exactly one tab current, wherever you are', () => {
    for (const current of [null, 'status', 'plans']) {
      const tabs = pluginPanelTabs({ pluginKey: 'dues', pages: PAGES, current })
      expect(tabs.filter((tab) => tab.isCurrent)).toHaveLength(1)
    }

    const onPlans = pluginPanelTabs({ pluginKey: 'dues', pages: PAGES, current: 'plans' })
    expect(onPlans.find((tab) => tab.isCurrent)?.label).toBe('Plans')
  })

  it('is nothing at all for a plugin with no pages — one tab is not a tab bar', () => {
    expect(pluginPanelTabs({ pluginKey: 'hello', pages: [], current: null })).toEqual([])
  })
})

describe('pluginStaffPanelTabs', () => {
  const STAFF = [
    { path: 'triage', title: 'Triage', href: '/modcp/plugins/dues/triage' },
    { path: 'audit', title: 'Audit', href: '/modcp/plugins/dues/audit' },
  ]

  it('lists the staff pages with no Settings tab — the panel is not the operator’s', () => {
    const tabs = pluginStaffPanelTabs({ pages: STAFF, current: 'triage' })
    expect(tabs.map((tab) => tab.label)).toEqual(['Triage', 'Audit'])
    expect(tabs.some((tab) => tab.label === PLUGIN_SETTINGS_TAB)).toBe(false)
    expect(tabs.find((tab) => tab.isCurrent)?.label).toBe('Triage')
  })

  it('is nothing for a single staff page — one tab is not a tab bar', () => {
    expect(pluginStaffPanelTabs({ pages: [STAFF[0]!], current: 'triage' })).toEqual([])
    expect(pluginStaffPanelTabs({ pages: [], current: null })).toEqual([])
  })
})

describe('pluginNavChildren', () => {
  it('is the pages as rail entries, in the order the plugin declared them', () => {
    expect(pluginNavChildren(PAGES)).toEqual([
      { href: '/admin/plugins/dues/status', titleText: 'Status' },
      { href: '/admin/plugins/dues/plans', titleText: 'Plans' },
    ])
  })
})
