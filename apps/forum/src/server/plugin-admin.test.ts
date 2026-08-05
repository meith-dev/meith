/**
 * F69's read model.
 *
 * The claims worth a test are the ones a screen would get wrong quietly:
 * "enabled" has three sources that disagree, an unreadable migration table must
 * not read as "nothing is pending", and a plugin the config disabled has to
 * appear at all — the host is never told about it, so it is invisible to every
 * other reader in the app.
 */
import type { PluginHealth } from '@meith/plugin-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as PluginHostModule from './plugin-host'

const config = {
  current: {
    themes: { default: { key: 'default', title: 'Default', tokens: { light: {}, dark: {} } } },
    defaultTheme: 'default',
    plugins: [] as Array<{ key: string; enabled?: boolean; plugin?: unknown }>,
  },
}
vi.mock('../../forum.config', () => ({
  get default() {
    return config.current
  },
}))

const overrides = { current: new Map<string, string>() }
vi.mock('./settings', () => ({
  getSettingOverrides: async () => overrides.current,
}))

const HEALTHY: PluginHealth = {
  key: 'alpha',
  enabled: true,
  operatorDisabled: false,
  disabledReason: null,
  calls: 3,
  failures: 0,
  slowCalls: 0,
  totalMs: 1.5,
  lastError: null,
}

const host = {
  health: (): readonly PluginHealth[] => [HEALTHY],
  listeners: () => ({ 'post.created': ['alpha'], 'markdown.render.html': [] }),
}
/*
 * Partial: the real `configuredPlugins` is the thing under test here as much as
 * anything else — it is where "absent means enabled" lives — so only the host
 * itself is replaced.
 */
vi.mock('./plugin-host', async (importOriginal) => ({
  ...(await importOriginal<typeof PluginHostModule>()),
  pluginHost: host,
}))

const dataSource = { current: 'postgres' as 'postgres' | 'fixture' }
const applied = { current: ['0001_first'] as readonly string[], throws: false }

vi.mock('@meith/core', () => ({
  get env() {
    return { DATA_SOURCE: dataSource.current }
  },
  logger: () => ({ warn: () => {}, info: () => {}, error: () => {} }),
}))

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  appliedPluginMigrations: async () => {
    if (applied.throws) throw new Error('no such table: plugin_migrations')
    return applied.current
  },
}))

const { hookListeners, pluginInventory, pluginRow } = await import('./plugin-admin')

const ALPHA = {
  key: 'alpha',
  name: 'Alpha',
  version: '1.2.0',
  description: 'Does a thing.',
  hooks: { 'post.created': () => {} },
  settings: [
    { key: 'api_url', label: 'URL', default: 'https://example.test' },
    { key: 'verbose', label: 'Verbose', default: false },
  ],
  migrations: [
    { id: '0001_first', statements: ['select 1'] },
    { id: '0002_second', statements: ['select 1'] },
  ],
  tasks: [{ id: 'sweep', intervalSeconds: 300, run: () => {} }],
  adminPages: [{ path: 'report', title: 'Report', render: () => null }],
  contributions: [{ region: 'board-index', render: () => null }],
}

beforeEach(() => {
  config.current.plugins = [{ key: 'alpha', plugin: ALPHA }]
  overrides.current = new Map()
  dataSource.current = 'postgres'
  applied.current = ['0001_first']
  applied.throws = false
})

describe('the three states of "enabled"', () => {
  it('a plugin the config allows and nobody switched off is running', async () => {
    const [row] = (await pluginInventory()).plugins
    expect(row).toMatchObject({ configuredEnabled: true, operatorEnabled: true, running: true })
  })

  /*
   * The host is only ever handed plugins it may call, so a config-disabled
   * plugin has no health entry and no other reader in the app can see it. If
   * this screen did not list it, an operator would have no way to discover that
   * the plugin they installed is switched off in a file.
   */
  it('lists a plugin disabled in forum.config.ts, and does not call it running', async () => {
    config.current.plugins = [{ key: 'alpha', enabled: false, plugin: ALPHA }]

    const [row] = (await pluginInventory()).plugins
    expect(row).toMatchObject({ configuredEnabled: false, running: false })
    expect(row?.name).toBe('Alpha')
  })

  it('reads the operator switch out of the settings overrides', async () => {
    overrides.current = new Map([['plugin.alpha._enabled', '0']])

    const [row] = (await pluginInventory()).plugins
    expect(row).toMatchObject({ configuredEnabled: true, operatorEnabled: false, running: false })
  })

  /*
   * `running` defers to the host's own answer rather than recomputing it, so a
   * plugin auto-disabled for failing is not reported as running merely because
   * both switches are on.
   */
  it('is not running when the host has auto-disabled it', async () => {
    const failing: PluginHealth = { ...HEALTHY, enabled: false, disabledReason: 'failed 5 times' }
    vi.spyOn(host, 'health').mockReturnValueOnce([failing])

    const [row] = (await pluginInventory()).plugins
    expect(row?.running).toBe(false)
    expect(row?.health?.disabledReason).toBe('failed 5 times')
  })
})

describe('migrations', () => {
  it('marks each declared migration applied or not', async () => {
    const [row] = (await pluginInventory()).plugins
    expect(row?.migrations).toEqual([
      { id: '0001_first', applied: true },
      { id: '0002_second', applied: false },
    ])
  })

  /*
   * The failure this prevents: a query that fell over reporting every migration
   * as pending, and an operator running an upgrade they did not need. "We could
   * not find out" and "nothing is pending" must not render the same.
   */
  it('says the state is unknown when the table cannot be read', async () => {
    applied.throws = true

    const inventory = await pluginInventory()
    expect(inventory.migrationsKnown).toBe(false)
  })

  it('is unknown in fixture mode, where there is no such table', async () => {
    dataSource.current = 'fixture'
    expect((await pluginInventory()).migrationsKnown).toBe(false)
  })

  it('is known — trivially — when no plugin declares a migration', async () => {
    config.current.plugins = [{ key: 'alpha', plugin: { ...ALPHA, migrations: [] } }]
    dataSource.current = 'fixture'

    /* No query is needed to answer "none pending", so fixture mode is not a gap. */
    expect((await pluginInventory()).migrationsKnown).toBe(true)
  })
})

describe('settings', () => {
  it('resolves declared settings, defaults included', async () => {
    const [row] = (await pluginInventory()).plugins
    expect(row?.settings).toEqual([
      {
        key: 'api_url',
        label: 'URL',
        description: null,
        advanced: false,
        kind: 'string',
        default: 'https://example.test',
        value: 'https://example.test',
        overridden: false,
      },
      {
        key: 'verbose',
        label: 'Verbose',
        description: null,
        advanced: false,
        kind: 'boolean',
        default: false,
        value: false,
        overridden: false,
      },
    ])
  })

  it('marks a stored value as overridden, so the screen can say so', async () => {
    overrides.current = new Map([['plugin.alpha.verbose', '1']])

    const [row] = (await pluginInventory()).plugins
    expect(row?.settings[1]).toMatchObject({ value: true, overridden: true })
  })

  it('derives the control from the default’s type, never from a declaration', async () => {
    config.current.plugins = [
      {
        key: 'alpha',
        plugin: { ...ALPHA, settings: [{ key: 'batch', label: 'Batch', default: 25 }] },
      },
    ]

    const [row] = (await pluginInventory()).plugins
    expect(row?.settings[0]).toMatchObject({ kind: 'number', value: 25 })
  })
})

describe('the rest of the manifest', () => {
  it('namespaces the task ids the way the registry will', async () => {
    const [row] = (await pluginInventory()).plugins
    expect(row?.tasks).toEqual([
      { id: 'sweep', registeredId: 'plugin.alpha.sweep', intervalSeconds: 300 },
    ])
  })

  it('builds each page’s route under the plugin’s own prefix', async () => {
    const [row] = (await pluginInventory()).plugins
    expect(row?.pages).toEqual([
      { path: 'report', title: 'Report', href: '/admin/plugins/alpha/report' },
    ])
  })

  it('reports hooks and regions', async () => {
    const [row] = (await pluginInventory()).plugins
    expect(row?.hooks).toEqual(['post.created'])
    expect(row?.regions).toEqual(['board-index'])
  })

  it('handles an entry that names a key and carries no code', async () => {
    config.current.plugins = [{ key: 'bare' }]

    const [row] = (await pluginInventory()).plugins
    expect(row).toMatchObject({ hasDefinition: false, name: null, running: false })
    expect(row?.settings).toEqual([])
  })
})

describe('pluginRow', () => {
  it('finds one by key', async () => {
    expect((await pluginRow('alpha'))?.name).toBe('Alpha')
  })

  it('is null for a key this build does not have', async () => {
    expect(await pluginRow('nope')).toBeNull()
  })
})

describe('hookListeners', () => {
  /*
   * A hook with no listener is dropped. Ninety-one rows of "nothing" would bury
   * the handful an operator is actually looking for, and the generated
   * reference is where the complete list belongs.
   */
  it('omits hooks nothing is listening on', () => {
    expect(hookListeners()).toEqual([{ hook: 'post.created', plugins: ['alpha'] }])
  })
})
