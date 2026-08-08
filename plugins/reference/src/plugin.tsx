/**
 * F80 — the reference plugin.
 *
 * It exists to be **exercised in CI**, not to be useful on a board. Its job is
 * to touch every extension point the documentation claims exists, so that a
 * documented capability which quietly stopped working fails a test rather than
 * a stranger's install.
 *
 * ## What "every extension point" means here, precisely
 *
 * Two different claims, and conflating them is how a reference plugin becomes
 * theatre:
 *
 *  - **Every kind of extension point** — a filter, an event, a setting, a
 *    migration, a task, an admin page, a UI contribution in every region, and
 *    all four lifecycle callbacks. All eight are below and `reference.test.ts`
 *    asserts each is present.
 *  - **Every *wired* hook** — the ones something in the board actually fires.
 *    `scripts/hook-callsites.mjs` derives that set from the tree, and the test
 *    requires this plugin to handle all of it. Requiring all 91 instead would
 *    mean writing seventy handlers for hooks no call site reaches, which proves
 *    nothing and would have to be maintained.
 *
 * The second is the honest measure, and it is deliberately a moving target:
 * wiring a new call site makes this plugin's test fail until a handler is added
 * here. That is the ratchet — a hook cannot be wired into the board without
 * something proving it fires.
 *
 * ## Everything it does is observable
 *
 * Handlers record into `RECORDED` rather than doing work. A reference plugin
 * that logged, or wrote to a table, or called out, would need a fixture for
 * each of those to be testable — and the thing under test is the *host*, not
 * the plugin. A recorder makes "did this hook fire, with what, in what order"
 * a plain assertion.
 */

import {
  definePlugin,
  REGION_NAMES,
  type PluginRegion,
  type PluginRegionContext,
} from '@meith/plugin-kit'

/**
 * What the plugin saw.
 *
 * Module-level and mutable, which is right for a test double and wrong for
 * anything else: a plugin holding request state across requests on a serverless
 * platform is a data leak between viewers. Named `RECORDED` and documented so
 * nobody copies the pattern into a real plugin.
 */
export const RECORDED: {
  hooks: { name: string; value: unknown }[]
  regions: PluginRegion[]
  lifecycle: string[]
  tasks: string[]
} = { hooks: [], regions: [], lifecycle: [], tasks: [] }

export function resetRecorder(): void {
  RECORDED.hooks = []
  RECORDED.regions = []
  RECORDED.lifecycle = []
  RECORDED.tasks = []
}

function record(name: string, value: unknown): void {
  RECORDED.hooks.push({ name, value })
}

/** The marker every filter leaves, so a test can find it in rendered HTML. */
export const MARK = 'reference-plugin'

function contribution(region: PluginRegion) {
  return {
    region,
    render: (context: PluginRegionContext) => {
      RECORDED.regions.push(context.region)
      return (
        <span data-plugin={MARK} data-region={context.region}>
          {MARK}:{context.region}
        </span>
      )
    },
  }
}

export const referencePlugin = definePlugin({
  key: 'reference',
  name: 'Reference plugin',
  version: '0.1.0',
  description: 'Exercises every documented extension point. Installed in CI, not on a board.',
  apiVersion: '0',

  /*
   * One setting of each shape the ACP has to render, because "derived from
   * `typeof default`" is a claim about three types and a test with one string
   * setting proves a third of it.
   */
  settings: [
    { key: 'greeting', label: 'Greeting', default: 'hello', description: 'Prefixed to the footer.' },
    { key: 'badge_limit', label: 'Badge limit', default: 3 },
    { key: 'noisy', label: 'Log every hook', default: false, advanced: true },
  ],

  /*
   * Two migrations rather than one: a single migration cannot demonstrate that
   * they are applied in ascending id order, which is the property `definePlugin`
   * refuses a manifest over.
   */
  migrations: [
    { id: '0001_create_table', statements: ['create table if not exists reference_plugin_note (id serial primary key)'] },
    { id: '0002_add_column', statements: ['alter table reference_plugin_note add column if not exists note text'] },
  ],

  tasks: [
    {
      id: 'sweep',
      intervalSeconds: 900,
      run: () => {
        RECORDED.tasks.push('sweep')
      },
    },
  ],

  adminPages: [
    {
      path: 'status',
      title: 'Reference plugin',
      render: (context) => (
        <p>
          {String(context.settings.greeting ?? 'hello')} — {RECORDED.hooks.length} hooks seen.
        </p>
      ),
    },
  ],

  /* Every region, so a theme that stops rendering one is a failing test. */
  contributions: REGION_NAMES.map(contribution),

  onInstall: () => void RECORDED.lifecycle.push('install'),
  onEnable: () => void RECORDED.lifecycle.push('enable'),
  onDisable: () => void RECORDED.lifecycle.push('disable'),
  onUninstall: () => void RECORDED.lifecycle.push('uninstall'),

  hooks: {
    /* ---- Shell (F27) ---- */
    'view.shell': (value) => {
      record('view.shell', value)
      return value
    },
    'view.header': (value) => {
      record('view.header', value)
      /*
       * A navigation link is the canonical "why would a plugin filter a view
       * model" example, and it is additive: the plugin appends rather than
       * replacing, because replacing `navigation` would delete the board's own
       * links and no plugin should be able to do that by accident.
       */
      return { ...value, navigation: [...value.navigation, { label: MARK, href: '/reference' }] }
    },
    'view.user-panel': (value) => {
      record('view.user-panel', value)
      return { ...value, links: [...value.links, { label: MARK, href: '/reference' }] }
    },
    'view.footer': (value) => {
      record('view.footer', value)
      return { ...value, links: [...value.links, { label: MARK, href: '/reference' }] }
    },
    /*
     * Observed and returned unchanged, deliberately.
     *
     * Every other shell filter here appends a link, and the temptation is to
     * append an option. A jump-box option is a *community id* the route
     * re-authorises — a plugin adding one either names a real community, which the
     * board already lists, or names a fake one and the member gets a 404 for
     * their trouble. Demonstrating the hook does not require demonstrating a
     * bad idea.
     */
    'view.community-jump': (value) => {
      record('view.community-jump', value)
      return value
    },

    /* ---- Announcements (F71) ---- */
    'view.announcement': (value) => {
      record('view.announcement', value)
      return value
    },

    /* ---- Index (F29/F75) ---- */
    'view.board-index': (value) => {
      record('view.board-index', value)
      return value
    },
    'view.community-row': (value) => {
      record('view.community-row', value)
      return value
    },
    'view.board-stats': (value) => {
      record('view.board-stats', value)
      return value
    },
    'view.who-is-online': (value) => {
      record('view.who-is-online', value)
      return value
    },
    'view.latest-threads': (value) => {
      record('view.latest-threads', value)
      return value
    },
    'view.latest-posts': (value) => {
      record('view.latest-posts', value)
      return value
    },

    /* ---- Community and thread (F30/F31) ---- */
    'view.community-display': (value) => {
      record('view.community-display', value)
      return value
    },
    'view.thread-row': (value) => {
      record('view.thread-row', value)
      return value
    },
    'view.subcommunity-list': (value) => {
      record('view.subcommunity-list', value)
      return value
    },
    'view.pagination': (value) => {
      record('view.pagination', value)
      return value
    },
    'view.thread-view': (value) => {
      record('view.thread-view', value)
      return value
    },
    'view.post-bit': (value) => {
      record('view.post-bit', value)
      return value
    },
    'view.post-actions': (value) => {
      record('view.post-actions', value)
      return value
    },

    /* ---- Members and search (F33/F73) ---- */
    'view.member-profile': (value) => {
      record('view.member-profile', value)
      return value
    },
    'view.search-form': (value) => {
      record('view.search-form', value)
      return value
    },

    /* ---- Errors (F34) ---- */
    'view.error-notice': (value) => {
      record('view.error-notice', value)
      return value
    },

    /* ---- Mutations (F39–F41) ---- */
    'thread.created': (value) => {
      record('thread.created', value)
    },
    'post.created': (value) => {
      record('post.created', value)
    },
    'post.edited': (value) => {
      record('post.edited', value)
    },

    /*
     * An explicit priority on one handler, so the ordering guarantee has a
     * consumer rather than only a unit test. 200 is after the default of 100.
     */
    'plugin.disabled': {
      priority: 200,
      handler: (value) => {
        record('plugin.disabled', value)
      },
    },
  },
})
