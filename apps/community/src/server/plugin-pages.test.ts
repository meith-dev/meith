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

vi.mock('./notifications', () => ({ notificationService: () => null }))

const logged: unknown[] = []
vi.mock(import('@meith/core'), async (importOriginal) => ({
  ...(await importOriginal()),
  logger: (() => ({
    info: () => {},
    warn: () => {},
    error: (detail: unknown) => {
      logged.push(detail)
    },
  })) as never,
}))

const { renderPluginAdminPage, renderPluginBoardPage, pluginBoardPageTitle } = await import(
  './plugin-pages'
)

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
  it('hands the page its resolved settings, a logger and the grant capability, and nothing else', async () => {
    overrides.current = new Map([['plugin.alpha.batch', '42']])
    await renderPluginAdminPage('alpha', 'report')

    expect(Object.keys(handed as object).sort()).toEqual([
      'data',
      'grants',
      'locale',
      'logger',
      'notify',
      'query',
      'settings',
      't',
      'users',
    ])
    expect((handed as { settings: unknown }).settings).toEqual({ batch: 42 })
  })

  it('hands the page the query string, empty when the caller has none', async () => {
    await renderPluginAdminPage('alpha', 'report', { notice: 'code-created' })
    expect((handed as { query: unknown }).query).toEqual({ notice: 'code-created' })

    await renderPluginAdminPage('alpha', 'report')
    expect((handed as { query: unknown }).query).toEqual({})
  })

  it('hands out grants and data that refuse cleanly when the board runs on sample data', async () => {
    await renderPluginAdminPage('alpha', 'report')
    const context = handed as {
      grants: {
        list(userId: number): Promise<unknown>
        holds(userId: number, groupKey: string): Promise<unknown>
      }
      data: { query(text: string): Promise<unknown> }
    }
    await expect(context.grants.list(1)).rejects.toThrow(/sample data/)
    await expect(context.grants.holds(1, 'supporters')).rejects.toThrow(/sample data/)
    await expect(context.data.query('select 1')).rejects.toThrow(/sample data/)
  })
})

describe('failure', () => {
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

describe('board pages', () => {
  const boardPage = (overridesToApply: Record<string, unknown> = {}) =>
    plugin({
      pages: [
        {
          path: '',
          title: 'Membership',
          access: 'member',
          render: (context: unknown) => {
            handed = context
            return 'page-markup'
          },
        },
        {
          path: 'open',
          title: 'Open page',
          access: 'anonymous',
          render: () => 'open-markup',
        },
      ],
      ...overridesToApply,
    })

  const member = {
    viewer: { userId: 7, isGuest: false },
    query: { a: '1' },
    boardUrl: 'https://b.example',
  }
  const guest = { viewer: { userId: null, isGuest: true }, query: {}, boardUrl: '' }

  beforeEach(() => {
    config.current.plugins = [{ key: 'alpha', plugin: boardPage() }]
  })

  it('renders for a member, handing the render its page context', async () => {
    const result = await renderPluginBoardPage('alpha', '', member)
    expect(result).toEqual({ outcome: 'rendered', title: 'Membership', node: 'page-markup' })

    const context = handed as Record<string, unknown>
    expect(Object.keys(context).sort()).toEqual([
      'boardUrl',
      'data',
      'grants',
      'locale',
      'logger',
      'notify',
      'path',
      'query',
      'settings',
      't',
      'users',
      'viewer',
    ])
    expect(context.viewer).toEqual({ userId: 7, isGuest: false })
    expect(context.query).toEqual({ a: '1' })
  })

  it('sends a guest to sign in on a member page, and lets one read an anonymous page', async () => {
    expect(await renderPluginBoardPage('alpha', '', guest)).toEqual({
      outcome: 'sign-in-first',
      title: 'Membership',
    })
    expect(await renderPluginBoardPage('alpha', 'open', guest)).toEqual({
      outcome: 'rendered',
      title: 'Open page',
      node: 'open-markup',
    })
  })

  it('treats unknown, config-disabled and operator-disabled as identically missing', async () => {
    expect((await renderPluginBoardPage('ghost', '', member)).outcome).toBe('missing')
    expect((await renderPluginBoardPage('alpha', 'nope', member)).outcome).toBe('missing')

    config.current.plugins = [{ key: 'alpha', enabled: false, plugin: boardPage() }]
    expect((await renderPluginBoardPage('alpha', '', member)).outcome).toBe('missing')

    config.current.plugins = [{ key: 'alpha', plugin: boardPage() }]
    overrides.current = new Map([['plugin.alpha._enabled', '0']])
    expect((await renderPluginBoardPage('alpha', '', member)).outcome).toBe('missing')
  })

  it('contains a throwing render: title survives, node is null, error is logged', async () => {
    config.current.plugins = [
      {
        key: 'alpha',
        plugin: boardPage({
          pages: [
            {
              path: '',
              title: 'Broken',
              access: 'anonymous',
              render: () => {
                throw new Error('render blew up')
              },
            },
          ],
        }),
      },
    ]

    expect(await renderPluginBoardPage('alpha', '', member)).toEqual({
      outcome: 'rendered',
      title: 'Broken',
      node: null,
    })
    expect(logged.length).toBeGreaterThan(0)
  })

  it('reads a page title for metadata without touching enablement', async () => {
    overrides.current = new Map([['plugin.alpha._enabled', '0']])
    expect(pluginBoardPageTitle('alpha', '')).toBe('Membership')
    expect(pluginBoardPageTitle('alpha', 'nope')).toBeNull()
  })
})
