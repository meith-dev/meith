import {
  definePlugin,
  REGION_NAMES,
  type PluginRegion,
  type PluginRegionContext,
} from '@meith/plugin-kit'

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

  settings: [
    { key: 'greeting', label: 'Greeting', default: 'hello', description: 'Prefixed to the footer.' },
    { key: 'badge_limit', label: 'Badge limit', default: 3 },
    { key: 'noisy', label: 'Log every hook', default: false, advanced: true },
  ],

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

  contributions: REGION_NAMES.map(contribution),

  onInstall: () => void RECORDED.lifecycle.push('install'),
  onEnable: () => void RECORDED.lifecycle.push('enable'),
  onDisable: () => void RECORDED.lifecycle.push('disable'),
  onUninstall: () => void RECORDED.lifecycle.push('uninstall'),

  hooks: {
    'view.shell': (value) => {
      record('view.shell', value)
      return value
    },
    'view.header': (value) => {
      record('view.header', value)
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
    'view.forum-jump': (value) => {
      record('view.forum-jump', value)
      return value
    },

    'view.announcement': (value) => {
      record('view.announcement', value)
      return value
    },

    'view.board-index': (value) => {
      record('view.board-index', value)
      return value
    },
    'view.forum-row': (value) => {
      record('view.forum-row', value)
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

    'view.forum-display': (value) => {
      record('view.forum-display', value)
      return value
    },
    'view.thread-row': (value) => {
      record('view.thread-row', value)
      return value
    },
    'view.subforum-list': (value) => {
      record('view.subforum-list', value)
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

    'view.member-profile': (value) => {
      record('view.member-profile', value)
      return value
    },
    'view.search-form': (value) => {
      record('view.search-form', value)
      return value
    },

    'view.error-notice': (value) => {
      record('view.error-notice', value)
      return value
    },

    'thread.created': (value) => {
      record('thread.created', value)
    },
    'post.created': (value) => {
      record('post.created', value)
    },
    'post.edited': (value) => {
      record('post.edited', value)
    },

    'plugin.disabled': {
      priority: 200,
      handler: (value) => {
        record('plugin.disabled', value)
      },
    },
  },
})
