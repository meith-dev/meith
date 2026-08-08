import { HOOKS, PluginHost, REGION_NAMES, type HookName } from '@meith/plugin-kit'
import { describe, expect, it } from 'vitest'

import { MARK, RECORDED, referencePlugin, resetRecorder } from './plugin'

/**
 * F80 — the acceptance criterion, as a test.
 *
 * "A CI reference plugin exercises every documented extension point" is only
 * worth something if *exercises* and *every* are both checked mechanically.
 * Both are, and they are checked against different sources: the extension-point
 * kinds against the manifest, and the hooks against the set of call sites
 * `scripts/hook-callsites.mjs` finds in the tree.
 */

/** The wired set, derived from the tree rather than restated here. */
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
  ])('declares at least one %s', (_kind, count) => {
    expect(count()).toBeGreaterThan(0)
  })

  it('implements all four lifecycle callbacks', () => {
    expect(typeof referencePlugin.onInstall).toBe('function')
    expect(typeof referencePlugin.onEnable).toBe('function')
    expect(typeof referencePlugin.onDisable).toBe('function')
    expect(typeof referencePlugin.onUninstall).toBe('function')
  })

  /*
   * Every region, not one. A region a theme quietly stopped rendering is
   * invisible from the plugin side — the contribution is collected, the node is
   * returned, and nobody puts it on the page — so the reference plugin
   * contributes to all six and the app-level test looks for the marker.
   */
  it('contributes to every region', () => {
    const regions = (referencePlugin.contributions ?? []).map((entry) => entry.region)
    expect([...regions].sort()).toEqual([...REGION_NAMES].sort())
  })

  /* One setting of each shape, because the ACP derives its control from the type. */
  it('declares a setting of each supported type', () => {
    const types = (referencePlugin.settings ?? []).map((setting) => typeof setting.default)
    expect([...new Set(types)].sort()).toEqual(['boolean', 'number', 'string'])
  })

  /* Two migrations, or the ascending-order rule has nothing to demonstrate. */
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
  /**
   * **The ratchet.** Wiring a new call site into the board makes this fail until
   * a handler is added here — so a hook cannot become part of the running
   * product without something proving it fires.
   *
   * The comparison is against the *wired* set, not the registry. Requiring all
   * ninety-one would mean seventy handlers for hooks no call site reaches, which
   * proves nothing and would have to be maintained forever.
   */
  it('handles every hook the board actually fires', async () => {
    const wired = await wiredHooks()
    const handled = Object.keys(referencePlugin.hooks ?? {})

    const missing = wired.filter((name) => !handled.includes(name))
    expect(missing, `wired hooks with no reference handler: ${missing.join(', ')}`).toEqual([])
  })

  /* The scan itself must not be vacuous — an empty wired set would pass above. */
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
      { boardTitle: 'Board', links: [{ label: 'Contact', href: '/contact' }], timezoneLabel: 'UTC' },
      viewer,
    )

    expect(result.links.map((link) => link.label)).toEqual(['Contact', MARK])
  })

  it('records an event it is told about', async () => {
    resetRecorder()
    await host().emit(
      'post.created',
      { postId: 1, threadId: 2, communityId: 3, authorId: 4 },
      { userId: 4, isGuest: false },
    )

    expect(RECORDED.hooks).toEqual([
      { name: 'post.created', value: { postId: 1, threadId: 2, communityId: 3, authorId: 4 } },
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

  /*
   * The host's own guarantee, proven through the plugin rather than through a
   * fixture: nothing this plugin does can take a page down, so a reference
   * plugin that started throwing would be a red test rather than a red board.
   */
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
