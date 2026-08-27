import {
  definePlugin,
  type PluginRegion,
  type PluginRegionContext,
  REGION_NAMES,
} from '@meith/plugin-kit'

import en from './messages/en.json'

export const RECORDED: {
  hooks: { name: string; value: unknown }[]
  hookRuntimes: { hook: string; settings: readonly string[] }[]
  regions: PluginRegion[]
  lifecycle: string[]
  tasks: string[]
  routes: { path: string; method: string }[]
  pages: string[]
} = { hooks: [], hookRuntimes: [], regions: [], lifecycle: [], tasks: [], routes: [], pages: [] }

export function resetRecorder(): void {
  RECORDED.hooks = []
  RECORDED.hookRuntimes = []
  RECORDED.regions = []
  RECORDED.lifecycle = []
  RECORDED.tasks = []
  RECORDED.routes = []
  RECORDED.pages = []
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
  name: en['reference.definition.name'],
  nameKey: 'reference.definition.name',
  version: '0.23.1',
  description: en['reference.definition.description'],
  descriptionKey: 'reference.definition.description',
  apiVersion: '0',

  settings: [
    {
      key: 'greeting',
      label: en['reference.setting.greeting.label'],
      labelKey: 'reference.setting.greeting.label',
      default: 'hello',
      description: en['reference.setting.greeting.description'],
      descriptionKey: 'reference.setting.greeting.description',
    },
    {
      key: 'badge_limit',
      label: en['reference.setting.badgeLimit.label'],
      labelKey: 'reference.setting.badgeLimit.label',
      default: 3,
    },
    {
      key: 'noisy',
      label: en['reference.setting.noisy.label'],
      labelKey: 'reference.setting.noisy.label',
      default: false,
      advanced: true,
    },
    {
      key: 'api_secret',
      label: en['reference.setting.apiSecret.label'],
      labelKey: 'reference.setting.apiSecret.label',
      type: 'secret',
      env: 'REFERENCE_API_SECRET',
      required: true,
      default: '',
      description: en['reference.setting.apiSecret.description'],
      descriptionKey: 'reference.setting.apiSecret.description',
    },
    {
      key: 'mode',
      label: en['reference.setting.mode.label'],
      labelKey: 'reference.setting.mode.label',
      type: 'select',
      options: [
        {
          value: 'record',
          label: en['reference.setting.mode.record'],
          labelKey: 'reference.setting.mode.record',
        },
        {
          value: 'replay',
          label: en['reference.setting.mode.replay'],
          labelKey: 'reference.setting.mode.replay',
        },
      ],
      default: 'record',
    },
  ],

  migrations: [
    {
      id: '0001_create_table',
      statements: ['create table if not exists plugin_reference_note (id serial primary key)'],
    },
    {
      id: '0002_add_column',
      statements: ['alter table plugin_reference_note add column if not exists note text'],
    },
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
      title: en['reference.admin.status.title'],
      titleKey: 'reference.admin.status.title',
      render: (context) =>
        context.t.t('reference.admin.status.summary', {
          greeting: String(context.settings.greeting ?? 'hello'),
          count: RECORDED.hooks.length,
        }),
    },
  ],

  routes: [
    {
      path: 'ping',
      method: 'GET',
      access: 'anonymous',
      handler: (request) => {
        RECORDED.routes.push({ path: request.path, method: request.method })
        return { kind: 'json', body: { pong: true, viewer: request.viewer } }
      },
    },
    {
      path: 'hook/echo',
      method: 'POST',
      access: 'anonymous',
      rawBody: true,
      maxBodyBytes: 1024,
      handler: (request) => {
        RECORDED.routes.push({ path: request.path, method: request.method })
        return { kind: 'text', body: String(request.rawBody?.byteLength ?? 0) }
      },
    },
    {
      path: 'leave',
      method: 'POST',
      access: 'member',
      handler: () => ({ kind: 'redirect', to: 'https://example.com/away' }),
    },
    {
      path: 'poke',
      method: 'POST',
      access: 'member',
      rateLimit: { limit: 2, windowSeconds: 60 },
      handler: async (request, context) => {
        RECORDED.routes.push({ path: request.path, method: request.method })
        await context.notify.send({
          userId: request.viewer.userId ?? 0,
          kind: 'poked',
          subjectKey: 'reference.notification.poked.subject',
          bodyKey: 'reference.notification.poked.body',
          href: '/reference',
        })
        return { kind: 'json', body: { poked: true } }
      },
    },
    {
      path: 'reset',
      method: 'POST',
      access: 'admin',
      handler: (request) => {
        resetRecorder()
        RECORDED.routes.push({ path: request.path, method: request.method })
        return { kind: 'redirect', to: '/admin/plugins/reference/status' }
      },
    },
  ],

  notifications: [
    {
      key: 'poked',
      title: en['reference.notification.poked.title'],
      titleKey: 'reference.notification.poked.title',
      description: en['reference.notification.poked.description'],
      descriptionKey: 'reference.notification.poked.description',
      emailByDefault: false,
    },
  ],

  pages: [
    {
      path: '',
      title: en['reference.page.title'],
      titleKey: 'reference.page.title',
      access: 'anonymous',
      render: (context) => {
        RECORDED.pages.push(context.path)
        return (
          <p data-plugin={MARK}>
            {context.t.t('reference.page.viewer', {
              viewer: String(context.viewer.userId ?? context.t.t('reference.page.guest')),
            })}
          </p>
        )
      },
    },
  ],

  navigation: [
    {
      key: 'reference',
      label: en['reference.nav.label'],
      labelKey: 'reference.nav.label',
      path: '',
      audience: 'members',
    },
  ],

  allowedRedirectHosts: ['example.com'],

  contributions: REGION_NAMES.map(contribution),

  onInstall: () => void RECORDED.lifecycle.push('install'),
  onEnable: () => void RECORDED.lifecycle.push('enable'),
  onDisable: () => void RECORDED.lifecycle.push('disable'),
  onUninstall: () => void RECORDED.lifecycle.push('uninstall'),

  hooks: {
    'markdown.parse.text': (value) => {
      record('markdown.parse.text', value)
      return value.replaceAll('[[reference]]', MARK)
    },
    'markdown.render.html': (value) => {
      record('markdown.render.html', value)
      return value
    },
    'markdown.directives': (value) => {
      record('markdown.directives', value)
      return [...value, { name: 'reference', block: true }]
    },
    'post.body.html': (value) => {
      record('post.body.html', value)
      return `${value}<p data-plugin="${MARK}">${MARK}</p>`
    },
    'signature.html': (value) => {
      record('signature.html', value)
      return `${value}<span data-plugin="${MARK}">${MARK}</span>`
    },
    'smilies.list': (value) => {
      record('smilies.list', value)
      return [...value, { code: ':reference:', src: '/reference.png', alt: MARK }]
    },
    'word-filter.patterns': (value) => {
      record('word-filter.patterns', value)
      return [...value, { pattern: 'unmentionable', replacement: MARK, wholeWord: true }]
    },

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
    'view.search-results': (value) => {
      record('view.search-results', value)
      return value
    },
    'view.discovery-view': (value) => {
      record('view.discovery-view', value)
      return value
    },

    'view.auth-page': (value) => {
      record('view.auth-page', value)
      return value
    },

    'view.panel-shell': (value) => {
      record('view.panel-shell', value)
      return value
    },
    'view.panel-nav': (value) => {
      record('view.panel-nav', value)
      return value
    },
    'view.panel-page': (value) => {
      record('view.panel-page', value)
      return value
    },
    'view.panel-section': (value) => {
      record('view.panel-section', value)
      return value
    },

    'view.error-notice': (value) => {
      record('view.error-notice', value)
      return value
    },

    'thread.created': (value) => {
      record('thread.created', value)
    },
    'post.created': async (value, _context, runtime) => {
      record('post.created', value)
      RECORDED.hookRuntimes.push({
        hook: 'post.created',
        settings: Object.keys((await runtime()).settings).sort(),
      })
    },
    'post.edited': (value) => {
      record('post.edited', value)
    },

    'view.navigation': (value) => {
      record('view.navigation', value)
      return value
    },
    'view.notice': (value) => {
      record('view.notice', value)
      return value
    },
    'view.category-block': (value) => {
      record('view.category-block', value)
      return value
    },
    'view.post-form': (value) => {
      record('view.post-form', value)
      return value
    },
    'view.quick-reply': (value) => {
      record('view.quick-reply', value)
      return value
    },
    'view.editor-toolbar': (value) => {
      record('view.editor-toolbar', value)
      return value
    },
    'view.redirect-notice': (value) => {
      record('view.redirect-notice', value)
      return value
    },
    'thread.create.before': (value) => {
      record('thread.create.before', value)
      return value
    },
    'post.create.before': (value) => {
      record('post.create.before', value)
      return value
    },
    'post.edit.before': (value) => {
      record('post.edit.before', value)
      return value
    },
    'notification.create.before': (value) => {
      record('notification.create.before', value)
      return value
    },
    'mail.send.before': (value) => {
      record('mail.send.before', value)
      return value
    },
    'pm.send.before': (value) => {
      record('pm.send.before', value)
      return value
    },
    'search.query.before': (value) => {
      record('search.query.before', value)
      return value
    },
    'search.results': (value) => {
      record('search.results', value)
      return value
    },
    'feed.items': (value) => {
      record('feed.items', value)
      return value
    },
    'sitemap.entries': (value) => {
      record('sitemap.entries', value)
      return value
    },
    'metadata.page': (value) => {
      record('metadata.page', value)
      return value
    },
    'admin.navigation': (value) => {
      record('admin.navigation', value)
      return value
    },
    'thread.create.validate': (value) => {
      record('thread.create.validate', value)
      return value
    },
    'post.create.validate': (value) => {
      record('post.create.validate', value)
      return value
    },
    'attachment.upload.validate': (value) => {
      record('attachment.upload.validate', value)
      return value
    },
    'user.register.validate': (value) => {
      record('user.register.validate', value)
      return value
    },
    'post.delete.before': (value) => {
      record('post.delete.before', value)
    },
    'post.deleted': (value) => {
      record('post.deleted', value)
    },
    'post.restored': (value) => {
      record('post.restored', value)
    },
    'thread.moved': (value) => {
      record('thread.moved', value)
    },
    'thread.merged': (value) => {
      record('thread.merged', value)
    },
    'thread.split': (value) => {
      record('thread.split', value)
    },
    'thread.locked': (value) => {
      record('thread.locked', value)
    },
    'thread.stickied': (value) => {
      record('thread.stickied', value)
    },
    'attachment.uploaded': (value) => {
      record('attachment.uploaded', value)
    },
    'attachment.deleted': (value) => {
      record('attachment.deleted', value)
    },
    'poll.created': (value) => {
      record('poll.created', value)
    },
    'poll.voted': (value) => {
      record('poll.voted', value)
    },
    'rating.recorded': (value) => {
      record('rating.recorded', value)
    },
    'report.created': (value) => {
      record('report.created', value)
    },
    'report.resolved': (value) => {
      record('report.resolved', value)
    },
    'approval.queued': (value) => {
      record('approval.queued', value)
    },
    'approval.decided': (value) => {
      record('approval.decided', value)
    },
    'warning.issued': (value) => {
      record('warning.issued', value)
    },
    'warning.revoked': (value) => {
      record('warning.revoked', value)
    },
    'moderation.logged': (value) => {
      record('moderation.logged', value)
    },
    'user.registered': (value) => {
      record('user.registered', value)
    },
    'user.activated': (value) => {
      record('user.activated', value)
    },
    'user.login.attempted': (value) => {
      record('user.login.attempted', value)
    },
    'user.logged-in': (value) => {
      record('user.logged-in', value)
    },
    'user.logged-out': (value) => {
      record('user.logged-out', value)
    },
    'user.banned': (value) => {
      record('user.banned', value)
    },
    'user.unbanned': (value) => {
      record('user.unbanned', value)
    },
    'user.groups.changed': (value) => {
      record('user.groups.changed', value)
    },
    'user.profile.updated': (value) => {
      record('user.profile.updated', value)
    },
    'user.merged': (value) => {
      record('user.merged', value)
    },
    'user.deleted': (value) => {
      record('user.deleted', value)
    },
    'notification.created': (value) => {
      record('notification.created', value)
    },
    'mail.sent': (value) => {
      record('mail.sent', value)
    },
    'pm.sent': (value) => {
      record('pm.sent', value)
    },
    'subscription.changed': (value) => {
      record('subscription.changed', value)
    },
    'reputation.changed': (value) => {
      record('reputation.changed', value)
    },
    'settings.saved': (value) => {
      record('settings.saved', value)
    },
    'task.run.before': (value) => {
      record('task.run.before', value)
    },
    'task.run.after': (value) => {
      record('task.run.after', value)
    },
    'cache.invalidated': (value) => {
      record('cache.invalidated', value)
    },
    'plugin.enabled': (value) => {
      record('plugin.enabled', value)
    },

    'plugin.disabled': {
      priority: 200,
      handler: (value) => {
        record('plugin.disabled', value)
      },
    },
  },
})
