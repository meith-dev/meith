/**
 * F69 — the one place in the panel where markup comes from installed code.
 *
 * The claims: a page belonging to a switched-off plugin does not render (or
 * "disabled" would mean "hooks stop, screens keep working"), a `render` that
 * throws is contained rather than becoming a broken panel, and the context a
 * page is handed is the same narrow one a task gets — settings and a logger,
 * never an actor or a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('./settings', () => ({ getSettingOverrides: async () => overrides.current }))

const logged: unknown[] = []
vi.mock('@meith/core', () => ({
  logger: () => ({
    info: () => {},
    warn: () => {},
    error: (detail: unknown) => logged.push(detail),
  }),
}))

const { renderPluginAdminPage } = await import('./plugin-pages')

let handed: unknown = null

function plugin(overridesToApply: Record<string, unknown> = {}) {
  return {
    key: 'alpha',
    name: 'Alpha',
    version: '1.0.0',
    settings: [{ key: 'batch', label: 'Batch', default: 10 }],
    adminPages: [
      {
        path: 'report',
        title: 'Report',
        render: (context: unknown) => {
          handed = context
          return 'markup'
        },
      },
    ],
    ...overridesToApply,
  }
}

beforeEach(() => {
  config.current.plugins = [{ key: 'alpha', plugin: plugin() }]
  overrides.current = new Map()
  logged.length = 0
  handed = null
})

describe('finding a page', () => {
  it('renders the declared page', async () => {
    expect(await renderPluginAdminPage('alpha', 'report')).toEqual({
      title: 'Report',
      node: 'markup',
    })
  })

  it('is null for a path the plugin does not declare', async () => {
    expect(await renderPluginAdminPage('alpha', 'other')).toBeNull()
  })

  it('is null for a plugin this build does not have', async () => {
    expect(await renderPluginAdminPage('ghost', 'report')).toBeNull()
  })

  it('is null for an entry with no definition', async () => {
    config.current.plugins = [{ key: 'bare' }]
    expect(await renderPluginAdminPage('bare', 'report')).toBeNull()
  })
})

describe('a plugin that is switched off has no pages either', () => {
  it('does not render when the config disabled it', async () => {
    config.current.plugins = [{ key: 'alpha', enabled: false, plugin: plugin() }]
    expect(await renderPluginAdminPage('alpha', 'report')).toBeNull()
  })

  it('does not render when an administrator switched it off', async () => {
    overrides.current = new Map([['plugin.alpha._enabled', '0']])
    expect(await renderPluginAdminPage('alpha', 'report')).toBeNull()
  })
})

describe('what crosses the boundary', () => {
  it('hands the page its resolved settings and a logger, and nothing else', async () => {
    overrides.current = new Map([['plugin.alpha.batch', '42']])
    await renderPluginAdminPage('alpha', 'report')

    expect(Object.keys(handed as object).sort()).toEqual(['logger', 'settings'])
    expect((handed as { settings: unknown }).settings).toEqual({ batch: 42 })
  })
})

describe('failure', () => {
  /*
   * Contained here, so a plugin that throws costs its own page and not the
   * panel. What cannot be contained from here is a *node* that throws during
   * React's render — that needs an error boundary, which is a client component.
   */
  it('returns the page with no node, and logs, when render throws', async () => {
    config.current.plugins = [
      {
        key: 'alpha',
        plugin: plugin({
          adminPages: [
            {
              path: 'report',
              title: 'Report',
              render: () => {
                throw new Error('boom')
              },
            },
          ],
        }),
      },
    ]

    expect(await renderPluginAdminPage('alpha', 'report')).toEqual({
      title: 'Report',
      node: null,
    })
    expect(logged).toHaveLength(1)
  })
})
