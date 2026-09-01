import { beforeEach, describe, expect, it, vi } from 'vitest'

const config = {
  current: {
    themes: { default: { key: 'default', title: 'Default', tokens: { light: {}, dark: {} } } },
    defaultTheme: 'default',
    plugins: [] as Array<{ key: string; enabled?: boolean; plugin?: unknown }>,
  },
}
vi.mock('@board/config', () => ({
  get default() {
    return config.current
  },
}))

const overrides = { current: new Map<string, string>() }
vi.mock('./settings', () => ({ getSettingOverrides: async () => overrides.current }))

const { pluginStaffPanelSection } = await import('./plugin-panel')

function plugin(pages: unknown[]) {
  return { key: 'dues', name: 'Dues', version: '1.0.0', pages }
}

const pages = [
  { path: 'triage', title: 'Triage', access: 'staff', render: () => null },
  { path: 'open', title: 'Open', access: 'member', render: () => null },
  { path: 'audit', title: 'Audit', access: 'staff', render: () => null },
]

beforeEach(() => {
  config.current.plugins = [{ key: 'dues', plugin: plugin(pages) }]
  overrides.current = new Map()
})

describe('pluginStaffPanelSection', () => {
  it('is the plugin’s staff pages only, at their modcp paths, in declared order', async () => {
    const section = await pluginStaffPanelSection('dues')
    expect(section?.name).toBe('Dues')
    expect(section?.pages).toEqual([
      { path: 'triage', title: 'Triage', href: '/modcp/plugins/dues/triage' },
      { path: 'audit', title: 'Audit', href: '/modcp/plugins/dues/audit' },
    ])
  })

  it('is null for a plugin whose pages are all board-facing', async () => {
    config.current.plugins = [
      {
        key: 'dues',
        plugin: plugin([{ path: '', title: 'Home', access: 'member', render: () => null }]),
      },
    ]
    expect(await pluginStaffPanelSection('dues')).toBeNull()
  })

  it('is null when the plugin is switched off in config or by the operator', async () => {
    config.current.plugins = [{ key: 'dues', enabled: false, plugin: plugin(pages) }]
    expect(await pluginStaffPanelSection('dues')).toBeNull()

    config.current.plugins = [{ key: 'dues', plugin: plugin(pages) }]
    overrides.current = new Map([['plugin.dues._enabled', '0']])
    expect(await pluginStaffPanelSection('dues')).toBeNull()
  })

  it('is null for a plugin this build does not have', async () => {
    expect(await pluginStaffPanelSection('ghost')).toBeNull()
  })
})
