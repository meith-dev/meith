import { describe, expect, it } from 'vitest'

import { sourceTranslator } from '@meith/i18n'
import {
  HOOKS,
  type HookName,
  PluginHost,
  REGION_NAMES,
  unavailablePluginData,
  unavailablePluginGrants,
  unavailablePluginUsers,
} from '@meith/plugin-kit'

import en from './messages/en.json'
import { MARK, RECORDED, referencePlugin, resetRecorder } from './plugin'

async function wiredHooks(): Promise<readonly HookName[]> {
  const { scanCallSites } = (await import('../../../scripts/hook-callsites.mjs')) as {
    scanCallSites: () => Promise<{ wired: Map<string, string[]>; problems: string[] }>
  }
  const { wired, problems } = await scanCallSites()
  expect(problems).toEqual([])
  return [...wired.keys()].sort() as HookName[]
}

describe('every kind of extension point', () => {
  it.each([
    ['hooks', () => Object.keys(referencePlugin.hooks ?? {}).length],
    ['settings', () => (referencePlugin.settings ?? []).length],
    ['migrations', () => (referencePlugin.migrations ?? []).length],
    ['tasks', () => (referencePlugin.tasks ?? []).length],
    ['admin pages', () => (referencePlugin.adminPages ?? []).length],
    ['contributions', () => (referencePlugin.contributions ?? []).length],
    ['notification kinds', () => (referencePlugin.notifications ?? []).length],
  ])('declares at least one %s', (_kind, count) => {
    expect(count()).toBeGreaterThan(0)
  })

  it('implements all four lifecycle callbacks', () => {
    expect(typeof referencePlugin.onInstall).toBe('function')
    expect(typeof referencePlugin.onEnable).toBe('function')
    expect(typeof referencePlugin.onDisable).toBe('function')
    expect(typeof referencePlugin.onUninstall).toBe('function')
  })

  it('contributes to every region', () => {
    const regions = (referencePlugin.contributions ?? []).map((entry) => entry.region)
    expect([...regions].sort()).toEqual([...REGION_NAMES].sort())
  })

  it('declares a setting of each supported type', () => {
    const types = (referencePlugin.settings ?? []).map((setting) => typeof setting.default)
    expect([...new Set(types)].sort()).toEqual(['boolean', 'number', 'string'])
  })

  it('declares more than one migration', () => {
    expect((referencePlugin.migrations ?? []).length).toBeGreaterThan(1)
  })

  it('uses the explicit priority form at least once', () => {
    const withPriority = Object.values(referencePlugin.hooks ?? {}).filter(
      (entry) => typeof entry === 'object' && entry !== null && 'priority' in entry,
    )
    expect(withPriority.length).toBeGreaterThan(0)
  })
})

describe('hook coverage', () => {
  it('handles every hook the board actually fires', async () => {
    const wired = await wiredHooks()
    const handled = Object.keys(referencePlugin.hooks ?? {})

    const missing = wired.filter((name) => !handled.includes(name))
    expect(missing, `wired hooks with no reference handler: ${missing.join(', ')}`).toEqual([])
  })

  it('finds a non-trivial wired set', async () => {
    expect((await wiredHooks()).length).toBeGreaterThan(15)
  })

  it('handles both a filter and an event', () => {
    const kinds = Object.keys(referencePlugin.hooks ?? {}).map(
      (name) => HOOKS[name as HookName].kind,
    )
    expect(kinds).toContain('filter')
    expect(kinds).toContain('event')
  })
})

describe('driven through a real host', () => {
  const host = () => new PluginHost({ plugins: [referencePlugin] })
  const viewer = { userId: 7, isGuest: false, requestId: null }

  it('adds its link to the footer without deleting the board’s', async () => {
    resetRecorder()
    const result = await host().applyFilter(
      'view.footer',
      {
        boardTitle: 'Board',
        links: [{ label: 'Contact', href: '/contact' }],
        timezoneLabel: 'UTC',
      },
      viewer,
    )

    expect(result.links.map((link) => link.label)).toEqual(['Contact', MARK])
  })

  it('records an event it is told about', async () => {
    resetRecorder()
    await host().emit(
      'post.created',
      { postId: 1, threadId: 2, forumId: 3, authorId: 4 },
      { userId: 4, isGuest: false },
    )

    expect(RECORDED.hooks).toEqual([
      { name: 'post.created', value: { postId: 1, threadId: 2, forumId: 3, authorId: 4 } },
    ])
  })

  it('renders into every region', () => {
    resetRecorder()
    const board = host()

    for (const region of REGION_NAMES) {
      const nodes = board.renderRegion(region, {
        region,
        viewer: { userId: 7, isGuest: false },
        subjectId: 1,
        authorId: 2,
      })
      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.key).toBe('reference')
    }

    expect([...RECORDED.regions].sort()).toEqual([...REGION_NAMES].sort())
  })

  it('never leaves the host in a failed state on a clean run', async () => {
    const board = host()
    await board.applyFilter(
      'view.pagination',
      { page: 1, pageCount: 1, pages: [], previousHref: null, nextHref: null },
      { userId: null, isGuest: true },
    )

    expect(board.health()[0]).toMatchObject({ failures: 0, enabled: true })
  })
})

describe('routes and pages', () => {
  it('declares at least one route of each shape, and a page', () => {
    const routes = referencePlugin.routes ?? []
    expect(routes.some((route) => route.rawBody === true)).toBe(true)
    expect(routes.some((route) => route.access === 'member')).toBe(true)
    expect(routes.some((route) => route.access === 'anonymous')).toBe(true)
    expect(routes.some((route) => route.access === 'admin')).toBe(true)
    expect(routes.some((route) => route.rateLimit !== undefined)).toBe(true)
    expect((referencePlugin.pages ?? []).length).toBeGreaterThan(0)
  })

  it('declares a secret setting with an environment override, and a select', () => {
    const settings = referencePlugin.settings ?? []
    const secret = settings.find((setting) => setting.type === 'secret')
    expect(secret?.env).toBeDefined()
    expect(secret?.default).toBe('')
    expect(settings.some((setting) => setting.type === 'select')).toBe(true)
  })

  it('answers a route through the host with the same accounting as a hook', async () => {
    resetRecorder()
    const board = new PluginHost({ plugins: [referencePlugin] })

    const context = {
      settings: {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      grants: unavailablePluginGrants('test'),
      data: unavailablePluginData('test'),
      users: unavailablePluginUsers('test'),
    }

    const route = (referencePlugin.routes ?? []).find((entry) => entry.path === 'ping')!
    const outcome = await board.run('reference', 'route GET ping', () =>
      route.handler(
        {
          viewer: { userId: 7, isGuest: false },
          method: 'GET',
          path: 'ping',
          query: {},
          headers: {},
          rawBody: null,
          form: null,
          json: null,
          boardUrl: 'https://board.example',
        },
        context,
      ),
    )

    expect(outcome).toMatchObject({ status: 'ok', value: { kind: 'json' } })
    expect(RECORDED.routes).toEqual([{ path: 'ping', method: 'GET' }])
    expect(board.health()[0]).toMatchObject({ calls: 1, failures: 0 })
  })

  it('hands the raw-body route its exact bytes', async () => {
    resetRecorder()
    const route = (referencePlugin.routes ?? []).find((entry) => entry.path === 'hook/echo')!

    const answer = await route.handler(
      {
        viewer: { userId: null, isGuest: true },
        method: 'POST',
        path: 'hook/echo',
        query: {},
        headers: { 'stripe-signature': 't=1,v1=abc' },
        rawBody: new Uint8Array([1, 2, 3]),
        form: null,
        json: null,
        boardUrl: '',
      },
      {
        settings: {},
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        grants: unavailablePluginGrants('test'),
        data: unavailablePluginData('test'),
        users: unavailablePluginUsers('test'),
      },
    )

    expect(answer).toEqual({ kind: 'text', body: '3' })
  })

  it('renders its board page with the page context', async () => {
    resetRecorder()
    const page = (referencePlugin.pages ?? []).find((entry) => entry.path === '')!

    const node = await page.render({
      settings: {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      grants: unavailablePluginGrants('test'),
      data: unavailablePluginData('test'),
      users: unavailablePluginUsers('test'),
      viewer: { userId: null, isGuest: true },
      path: '',
      query: {},
      boardUrl: '',
      locale: 'en',
      t: sourceTranslator(en),
    })

    expect(node).not.toBeNull()
    expect(RECORDED.pages).toEqual([''])
  })
})
